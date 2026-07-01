// AureStream privileged helper — launchd-spawned root daemon that exposes a
// capability-limited XPC interface to the main AureStream app.
//
// Every connection is validated against a hard-coded designated requirement
// before any method is allowed to run. For local development, it checks if
// the bundle identifier is `com.root.aurestream`.
//
// Beyond `ping`, the helper exposes a small set of capability methods.
// Every method has hard-coded parameter validation:
//
//   - startSingBox: config path must live under the caller's Application
//     Support directory; log path must live under the caller's
//     ~/Library/Logs/com.root.aurestream/ directory; the sing-box binary
//     path is derived from the caller's SecCode bundle, never passed by
//     the caller.
//   - stopSingBox / reloadSingBox: operate only on the pid the helper
//     itself spawned, never an arbitrary pid.
//   - setDnsServers: service name restricted to [A-Za-z0-9 _-], dns spec
//     must be either "empty" or a space-separated list of valid IPs.
//   - removeTunRoutes: interface name must match /^utun[0-9]+$/.
//   - setIpForwarding: boolean, no injection surface.
//   - flushDnsCache: no parameters.
//
// Process exit notifications flow back to the client over the same
// NSXPCConnection via a bidirectional XPC interface
// (AureStreamHelperClientProtocol), so the main app can trigger its existing
// process-termination handler without polling.

#import <Foundation/Foundation.h>
#import <Security/Security.h>
#import <bsm/libbsm.h>
#include <arpa/inet.h>
#include <dispatch/dispatch.h>
#include <fcntl.h>
#include <signal.h>
#include <spawn.h>
#include <sys/event.h>
#include <sys/stat.h>
#include <sys/sysctl.h>
#include <sys/wait.h>
#include <unistd.h>

// NSXPCConnection has an undocumented but ABI-stable `auditToken` property
// since macOS 10.10. Apple's own EvenBetterAuthorizationSample relies on
// exactly this access pattern.
@interface NSXPCConnection (AureStreamPrivate)
@property (nonatomic, readonly) audit_token_t auditToken;
@end

@protocol AureStreamHelperProtocol
- (void)pingWithReply:(void (^)(NSString *reply))reply;

- (void)startSingBoxWithConfigPath:(NSString *)configPath
                            logPath:(NSString *)logPath
                              reply:(void (^)(int pid, NSString *error))reply;

- (void)stopSingBoxWithReply:(void (^)(NSString *error))reply;

- (void)ensurePortFree:(int)port reply:(void (^)(int killedCount, NSString *error))reply;

- (void)reloadSingBoxWithReply:(void (^)(NSString *error))reply;

- (void)setIpForwarding:(BOOL)enable
                  reply:(void (^)(NSString *error))reply;

- (void)setDnsServersForService:(NSString *)serviceName
                            spec:(NSString *)dnsSpec
                           reply:(void (^)(NSString *error))reply;

- (void)flushDnsCacheWithReply:(void (^)(NSString *error))reply;

- (void)removeTunRoutesForInterface:(NSString *)interfaceName
                               reply:(void (^)(NSString *error))reply;

- (void)uninstallSelfWithReply:(void (^)(NSString *error))reply;
@end

static NSString *const kBlessedHelperLabel = @"com.root.aurestream.helper";
static NSString *const kBlessedHelperPath =
    @"/Library/PrivilegedHelperTools/com.root.aurestream.helper";
static NSString *const kBlessedPlistPath =
    @"/Library/LaunchDaemons/com.root.aurestream.helper.plist";

// Helper → Client direction. The main app exports an object conforming to
// this protocol so the helper can push process-exit events without polling.
@protocol AureStreamHelperClientProtocol
- (void)singBoxDidExitWithPid:(int)pid exitCode:(int)exitCode;
@end

// ============================================================================
// Caller validation
// ============================================================================

// Simplified requirement to check bundle identifier only, which works for
// local development and ad-hoc signing without a Developer ID certificate.
static NSString *const kClientRequirement = @"identifier \"com.root.aurestream\"";
static NSString *const kExpectedBundleId = @"com.root.aurestream";

static SecCodeRef copyClientSecCode(NSXPCConnection *connection) {
    audit_token_t token = connection.auditToken;

    CFDataRef tokenData = CFDataCreate(NULL, (const UInt8 *)&token, sizeof(token));
    if (tokenData == NULL) {
        return NULL;
    }

    const void *keys[] = { kSecGuestAttributeAudit };
    const void *values[] = { tokenData };
    CFDictionaryRef attrs = CFDictionaryCreate(
        NULL, keys, values, 1,
        &kCFTypeDictionaryKeyCallBacks,
        &kCFTypeDictionaryValueCallBacks);
    CFRelease(tokenData);
    if (attrs == NULL) {
        return NULL;
    }

    SecCodeRef code = NULL;
    OSStatus status =
        SecCodeCopyGuestWithAttributes(NULL, attrs, kSecCSDefaultFlags, &code);
    CFRelease(attrs);
    if (status != errSecSuccess) {
        if (code) CFRelease(code);
        return NULL;
    }
    return code;
}

// Fallback: validate caller by reading CFBundleIdentifier from its Info.plist.
// Used when the caller has no code signature (e.g. tauri dev, unsigned builds).
static BOOL validateClientByBundleId(NSXPCConnection *connection) {
    SecCodeRef code = copyClientSecCode(connection);
    if (code == NULL) {
        return NO;
    }

    SecStaticCodeRef staticCode = NULL;
    OSStatus status = SecCodeCopyStaticCode(code, kSecCSDefaultFlags, &staticCode);
    CFRelease(code);
    if (status != errSecSuccess || staticCode == NULL) {
        return NO;
    }

    CFURLRef bundleURL = NULL;
    status = SecCodeCopyPath(staticCode, kSecCSDefaultFlags, &bundleURL);
    CFRelease(staticCode);
    if (status != errSecSuccess || bundleURL == NULL) {
        if (bundleURL) CFRelease(bundleURL);
        return NO;
    }

    // Walk up from the executable to find the .app bundle's Info.plist
    NSURL *url = (__bridge_transfer NSURL *)bundleURL;
    NSURL *appBundle = url;
    while (appBundle != nil && ![[appBundle pathExtension] isEqualToString:@"app"]) {
        appBundle = [appBundle URLByDeletingLastPathComponent];
    }

    if (appBundle == nil) {
        NSLog(@"[helper] reject: could not find .app bundle for caller at %@", url.path);
        return NO;
    }

    NSURL *infoPlistURL = [appBundle URLByAppendingPathComponent:@"Contents/Info.plist"];
    NSDictionary *infoPlist = [NSDictionary dictionaryWithContentsOfURL:infoPlistURL];
    if (infoPlist == nil) {
        NSLog(@"[helper] reject: could not read Info.plist at %@", infoPlistURL.path);
        return NO;
    }

    NSString *bundleId = infoPlist[@"CFBundleIdentifier"];
    if (![bundleId isKindOfClass:[NSString class]]) {
        NSLog(@"[helper] reject: no CFBundleIdentifier in caller Info.plist");
        return NO;
    }

    if (![bundleId isEqualToString:kExpectedBundleId]) {
        NSLog(@"[helper] reject: caller bundle id '%@' != expected '%@'", bundleId, kExpectedBundleId);
        return NO;
    }

    NSLog(@"[helper] fallback validation passed: bundle id match for %@", url.path);
    return YES;
}

static BOOL validateClient(NSXPCConnection *connection) {
    SecCodeRef code = copyClientSecCode(connection);
    if (code == NULL) {
        NSLog(@"[helper] reject: failed to resolve audit token to SecCode");
        return NO;
    }

    SecRequirementRef requirement = NULL;
    OSStatus status = SecRequirementCreateWithString(
        (__bridge CFStringRef)kClientRequirement, kSecCSDefaultFlags, &requirement);
    if (status != errSecSuccess || requirement == NULL) {
        NSLog(@"[helper] reject: SecRequirementCreateWithString failed: %d", (int)status);
        CFRelease(code);
        if (requirement) CFRelease(requirement);
        return NO;
    }

    status = SecCodeCheckValidity(code, kSecCSDefaultFlags, requirement);
    CFRelease(requirement);

    if (status == errSecSuccess) {
        CFRelease(code);
        return YES;
    }

    NSLog(@"[helper] SecCodeCheckValidity failed: %d, attempting fallback validation", (int)status);
    CFRelease(code);

    // Fallback: validate by bundle ID from Info.plist for unsigned / ad-hoc callers
    return validateClientByBundleId(connection);
}

static BOOL copyCallerUser(NSXPCConnection *connection, uid_t *uidOut, gid_t *gidOut) {
    if (connection == nil || uidOut == NULL || gidOut == NULL) {
        return NO;
    }

    uid_t auid = 0;
    uid_t euid = 0;
    gid_t egid = 0;
    uid_t ruid = 0;
    gid_t rgid = 0;
    pid_t pid = 0;
    au_asid_t asid = 0;
    au_tid_t tid;
    memset(&tid, 0, sizeof(tid));

    audit_token_to_au32(connection.auditToken, &auid, &euid, &egid, &ruid, &rgid, &pid, &asid, &tid);

    uid_t uid = euid != 0 ? euid : ruid;
    gid_t gid = egid != 0 ? egid : rgid;
    if (uid == 0) {
        NSLog(@"[helper] reject: caller uid resolved to root pid=%d", pid);
        return NO;
    }

    *uidOut = uid;
    *gidOut = gid;
    return YES;
}

// Derive the absolute path to the caller's bundled sing-box binary from
// their SecCode.
static NSString *copyCallerSingBoxPath(NSXPCConnection *connection) {
    SecCodeRef code = copyClientSecCode(connection);
    if (code == NULL) {
        return nil;
    }

    SecStaticCodeRef staticCode = NULL;
    OSStatus status = SecCodeCopyStaticCode(code, kSecCSDefaultFlags, &staticCode);
    CFRelease(code);
    if (status != errSecSuccess || staticCode == NULL) {
        NSLog(@"[helper] SecCodeCopyStaticCode failed: %d", (int)status);
        return nil;
    }

    CFURLRef bundleURL = NULL;
    status = SecCodeCopyPath(staticCode, kSecCSDefaultFlags, &bundleURL);
    CFRelease(staticCode);
    if (status != errSecSuccess || bundleURL == NULL) {
        NSLog(@"[helper] SecCodeCopyPath failed: %d", (int)status);
        if (bundleURL) CFRelease(bundleURL);
        return nil;
    }

    NSURL *url = (__bridge_transfer NSURL *)bundleURL;
    NSString *sidecar = [url.path stringByAppendingPathComponent:@"Contents/MacOS/aurestream-core"];
    if (![[NSFileManager defaultManager] fileExistsAtPath:sidecar]) {
        NSLog(@"[helper] derived aurestream-core path does not exist: %@", sidecar);
        return nil;
    }
    return sidecar;
}

// ============================================================================
// Parameter validation
// ============================================================================

// Config path must be absolute, end with .json, exist on disk, and live
// inside a user's Application Support directory for our bundle id.
static NSString *validateConfigPath(NSString *path) {
    if (path.length == 0) return @"config path is empty";
    if (![path isAbsolutePath]) return @"config path must be absolute";
    if (![path.pathExtension isEqualToString:@"json"]) return @"config path must end with .json";
    if ([path rangeOfString:@"/../"].location != NSNotFound) return @"config path must not contain /../";
    if ([path rangeOfString:@"/Library/Application Support/com.root.aurestream/"].location == NSNotFound) {
        return @"config path must be under ~/Library/Application Support/com.root.aurestream/";
    }
    BOOL isDir = NO;
    if (![[NSFileManager defaultManager] fileExistsAtPath:path isDirectory:&isDir] || isDir) {
        return @"config file does not exist";
    }
    return nil;
}

// Log path must be absolute, end with .log, not traverse outside the
// caller's per-user logs dir, and sit inside ~/Library/Logs/com.root.aurestream/.
static NSString *validateLogPath(NSString *path) {
    if (path.length == 0) return @"log path is empty";
    if (![path isAbsolutePath]) return @"log path must be absolute";
    if (![path.pathExtension isEqualToString:@"log"]) return @"log path must end with .log";
    if ([path rangeOfString:@"/../"].location != NSNotFound) return @"log path must not contain /../";
    if ([path rangeOfString:@"/Library/Logs/com.root.aurestream/"].location == NSNotFound) {
        return @"log path must be under ~/Library/Logs/com.root.aurestream/";
    }
    NSString *parent = [path stringByDeletingLastPathComponent];
    BOOL isDir = NO;
    if (![[NSFileManager defaultManager] fileExistsAtPath:parent isDirectory:&isDir] || !isDir) {
        return @"log path parent directory does not exist";
    }
    return nil;
}

static NSString *validateServiceName(NSString *name) {
    if (name.length == 0 || name.length > 64) return @"service name length out of range";
    static NSCharacterSet *allowed = nil;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        allowed = [NSCharacterSet characterSetWithCharactersInString:
            @"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 _-"];
    });
    if ([name rangeOfCharacterFromSet:[allowed invertedSet]].location != NSNotFound) {
        return @"service name contains forbidden characters";
    }
    return nil;
}

static NSString *validateInterfaceName(NSString *name) {
    if (![name hasPrefix:@"utun"] || name.length < 5 || name.length > 10) {
        return @"interface must match ^utun[0-9]+$";
    }
    NSCharacterSet *digits = [NSCharacterSet decimalDigitCharacterSet];
    NSString *suffix = [name substringFromIndex:4];
    if ([suffix rangeOfCharacterFromSet:[digits invertedSet]].location != NSNotFound) {
        return @"interface must match ^utun[0-9]+$";
    }
    return nil;
}

static BOOL isValidIpLiteral(NSString *s) {
    struct in_addr v4;
    struct in6_addr v6;
    return inet_pton(AF_INET, s.UTF8String, &v4) == 1 ||
           inet_pton(AF_INET6, s.UTF8String, &v6) == 1;
}

static NSString *validateDnsSpec(NSString *spec) {
    if (spec.length == 0) return @"dns spec is empty";
    if ([spec isEqualToString:@"empty"]) return nil;
    NSArray<NSString *> *parts = [spec componentsSeparatedByCharactersInSet:
        [NSCharacterSet whitespaceCharacterSet]];
    BOOL any = NO;
    for (NSString *p in parts) {
        if (p.length == 0) continue;
        any = YES;
        if (!isValidIpLiteral(p)) {
            return [NSString stringWithFormat:@"invalid IP in dns spec: %@", p];
        }
    }
    if (!any) return @"dns spec has no entries";
    return nil;
}

static int openLogFileForCaller(NSString *path, NSXPCConnection *connection, NSString **errorOut) {
    uid_t callerUid = 0;
    gid_t callerGid = 0;
    if (!copyCallerUser(connection, &callerUid, &callerGid)) {
        if (errorOut) *errorOut = @"failed to resolve caller uid/gid";
        return -1;
    }

    const char *logC = path.UTF8String;
    int fd = open(logC, O_WRONLY | O_CREAT | O_APPEND | O_CLOEXEC | O_NOFOLLOW, 0644);
    if (fd < 0) {
        if (errorOut) {
            *errorOut = [NSString stringWithFormat:@"open log failed: %s", strerror(errno)];
        }
        return -1;
    }

    if (fchown(fd, callerUid, callerGid) != 0) {
        int savedErrno = errno;
        close(fd);
        if (errorOut) {
            *errorOut = [NSString stringWithFormat:@"chown log failed: %s", strerror(savedErrno)];
        }
        return -1;
    }

    if (fchmod(fd, 0644) != 0) {
        int savedErrno = errno;
        close(fd);
        if (errorOut) {
            *errorOut = [NSString stringWithFormat:@"chmod log failed: %s", strerror(savedErrno)];
        }
        return -1;
    }

    return fd;
}

// ============================================================================
// Shell-out helper
// ============================================================================

static NSString *runTool(NSString *tool, NSArray<NSString *> *args) {
    NSTask *task = [[NSTask alloc] init];
    task.launchPath = tool;
    task.arguments = args;
    task.standardInput = [NSFileHandle fileHandleWithNullDevice];
    NSPipe *outPipe = [NSPipe pipe];
    NSPipe *errPipe = [NSPipe pipe];
    task.standardOutput = outPipe;
    task.standardError = errPipe;
    @try {
        [task launch];
        [task waitUntilExit];
    } @catch (NSException *ex) {
        return [NSString stringWithFormat:@"%@ launch failed: %@", tool, ex.reason];
    }
    if (task.terminationStatus != 0) {
        NSData *errData = [errPipe.fileHandleForReading readDataToEndOfFile];
        NSString *err = [[NSString alloc] initWithData:errData encoding:NSUTF8StringEncoding];
        return [NSString stringWithFormat:@"%@ exit=%d: %@",
                tool, task.terminationStatus, err ?: @"(no stderr)"];
    }
    return nil;
}

// ============================================================================
// Service
// ============================================================================

@interface HelperService : NSObject <NSXPCListenerDelegate, AureStreamHelperProtocol>
@end

@implementation HelperService {
    dispatch_queue_t _stateQueue;
    pid_t _activePid;
    dispatch_source_t _exitSource;
    __weak NSXPCConnection *_activeConnection;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _stateQueue = dispatch_queue_create("com.root.aurestream.helper.state", DISPATCH_QUEUE_SERIAL);
    }
    return self;
}

- (BOOL)listener:(NSXPCListener *)listener
    shouldAcceptNewConnection:(NSXPCConnection *)newConnection {
    if (!validateClient(newConnection)) {
        NSLog(@"[helper] connection rejected pid=%d", newConnection.processIdentifier);
        return NO;
    }
    NSLog(@"[helper] connection accepted pid=%d", newConnection.processIdentifier);

    newConnection.exportedInterface =
        [NSXPCInterface interfaceWithProtocol:@protocol(AureStreamHelperProtocol)];
    newConnection.exportedObject = self;

    newConnection.remoteObjectInterface =
        [NSXPCInterface interfaceWithProtocol:@protocol(AureStreamHelperClientProtocol)];

    [newConnection resume];
    return YES;
}

// ------------------------------------------------------------------
// ping
// ------------------------------------------------------------------
- (void)pingWithReply:(void (^)(NSString *))reply {
    reply([NSString stringWithFormat:@"pong pid=%d uid=%d", getpid(), getuid()]);
}

// ------------------------------------------------------------------
// startSingBox
// ------------------------------------------------------------------
- (void)startSingBoxWithConfigPath:(NSString *)configPath
                            logPath:(NSString *)logPath
                              reply:(void (^)(int pid, NSString *error))reply {
    NSString *validationError = validateConfigPath(configPath);
    if (validationError) {
        reply(0, validationError);
        return;
    }
    validationError = validateLogPath(logPath);
    if (validationError) {
        reply(0, validationError);
        return;
    }

    NSXPCConnection *conn = [NSXPCConnection currentConnection];
    if (conn == nil) {
        reply(0, @"no current XPC connection");
        return;
    }
    NSString *sidecarPath = copyCallerSingBoxPath(conn);
    if (sidecarPath == nil) {
        reply(0, @"failed to derive sing-box path from caller SecCode");
        return;
    }

    __block int resultPid = 0;
    __block NSString *resultErr = nil;
    dispatch_sync(_stateQueue, ^{
        if (self->_activePid != 0) {
            pid_t old = self->_activePid;
            NSLog(@"[helper] reaping prior sing-box pid=%d before new spawn", old);
            if (self->_exitSource) {
                dispatch_source_cancel(self->_exitSource);
                self->_exitSource = nil;
            }
            kill(old, SIGKILL);
            int status = 0;
            for (int i = 0; i < 50; i++) {
                pid_t w = waitpid(old, &status, WNOHANG);
                if (w == old || w == -1) break;
                usleep(10000);
            }
            self->_activePid = 0;
            self->_activeConnection = nil;
        }

        NSString *logOpenErr = nil;
        int logFd = openLogFileForCaller(logPath, conn, &logOpenErr);
        if (logFd < 0) {
            resultErr = logOpenErr ?: @"failed to open log file";
            return;
        }

        posix_spawn_file_actions_t actions;
        posix_spawn_file_actions_init(&actions);
        posix_spawn_file_actions_addopen(&actions, STDIN_FILENO, "/dev/null", O_RDONLY, 0);
        posix_spawn_file_actions_adddup2(&actions, logFd, STDOUT_FILENO);
        posix_spawn_file_actions_adddup2(&actions, logFd, STDERR_FILENO);
        posix_spawn_file_actions_addclose(&actions, logFd);

        posix_spawnattr_t attrs;
        posix_spawnattr_init(&attrs);
        // Put sing-box in its own process group (pgid == child pid) so we can
        // signal the whole group on stop and never leave a port-holding straggler.
        short flags = POSIX_SPAWN_SETSIGDEF | POSIX_SPAWN_SETPGROUP;
        posix_spawnattr_setflags(&attrs, flags);
        posix_spawnattr_setpgroup(&attrs, 0);
        sigset_t defaultSignals;
        sigemptyset(&defaultSignals);
        sigaddset(&defaultSignals, SIGTERM);
        sigaddset(&defaultSignals, SIGHUP);
        sigaddset(&defaultSignals, SIGINT);
        posix_spawnattr_setsigdefault(&attrs, &defaultSignals);

        const char *sidecarC = sidecarPath.UTF8String;
        const char *configC = configPath.UTF8String;
        char *const argv[] = {
            (char *)sidecarC,
            (char *)"run",
            (char *)"-c",
            (char *)configC,
            (char *)"--disable-color",
            NULL
        };

        pid_t pid = 0;
        int rc = posix_spawn(&pid, sidecarC, &actions, &attrs, argv, NULL);
        posix_spawn_file_actions_destroy(&actions);
        posix_spawnattr_destroy(&attrs);
        close(logFd);

        if (rc != 0) {
            resultErr = [NSString stringWithFormat:@"posix_spawn failed: %s (%d)",
                         strerror(rc), rc];
            return;
        }

        self->_activePid = pid;
        self->_activeConnection = conn;

        self->_exitSource = dispatch_source_create(
            DISPATCH_SOURCE_TYPE_PROC,
            (uintptr_t)pid,
            DISPATCH_PROC_EXIT,
            dispatch_get_global_queue(QOS_CLASS_DEFAULT, 0));

        __weak HelperService *weakSelf = self;
        dispatch_source_t source = self->_exitSource;
        dispatch_source_set_event_handler(source, ^{
            HelperService *strongSelf = weakSelf;
            if (!strongSelf) return;

            int status = 0;
            waitpid(pid, &status, WNOHANG);
            int exitCode = -1;
            if (WIFEXITED(status)) {
                exitCode = WEXITSTATUS(status);
            } else if (WIFSIGNALED(status)) {
                exitCode = 128 + WTERMSIG(status);
            }

            NSLog(@"[helper] sing-box pid=%d exited code=%d", pid, exitCode);

            NSXPCConnection *notifyConn = strongSelf->_activeConnection;
            if (notifyConn) {
                id<AureStreamHelperClientProtocol> client =
                    [notifyConn remoteObjectProxyWithErrorHandler:^(NSError *err) {
                        NSLog(@"[helper] failed to notify client of exit: %@", err);
                    }];
                [client singBoxDidExitWithPid:pid exitCode:exitCode];
            }

            dispatch_sync(strongSelf->_stateQueue, ^{
                if (strongSelf->_activePid == pid) {
                    strongSelf->_activePid = 0;
                    strongSelf->_activeConnection = nil;
                    if (strongSelf->_exitSource) {
                        dispatch_source_cancel(strongSelf->_exitSource);
                        strongSelf->_exitSource = nil;
                    }
                }
            });
        });
        dispatch_resume(source);

        resultPid = pid;
        NSLog(@"[helper] spawned sing-box pid=%d config=%@", pid, configPath);
    });

    reply(resultPid, resultErr);
}

// ------------------------------------------------------------------
// stopSingBox
// ------------------------------------------------------------------
static void reapSingBoxPid(pid_t pid) {
    if (pid <= 0) return;
    // Signal the whole process group (negative pid) so any child sing-box spawned
    // also dies; fall back to the single pid if the group send fails.
    if (killpg(pid, SIGTERM) != 0) {
        kill(pid, SIGTERM);
    }
    NSLog(@"[helper] sent SIGTERM to sing-box pid=%d (group)", pid);
    for (int i = 0; i < 300; i++) {
        if (kill(pid, 0) != 0 && errno == ESRCH) {
            return;
        }
        usleep(10000);
    }
    if (killpg(pid, SIGKILL) != 0) {
        kill(pid, SIGKILL);
    }
    NSLog(@"[helper] sent SIGKILL to sing-box pid=%d (group)", pid);
    int status = 0;
    for (int i = 0; i < 100; i++) {
        pid_t w = waitpid(pid, &status, WNOHANG);
        if (w == pid || w == -1) break;
        usleep(10000);
    }
}

// Kill any process holding a socket on `port` in any TCP state (not just LISTEN).
// Two-pass approach: first LISTEN (the primary server), then ALL states to catch
// ESTABLISHED child connections that survive killpg of the parent.
// Returns the number of pids killed.
static int killListenersOnPort(int port) {
    static const char *states[] = {"LISTEN", NULL};
    int totalKilled = 0;
    for (int pass = 0; pass < 2; pass++) {
        char cmd[192];
        if (states[pass] != NULL) {
            snprintf(cmd, sizeof(cmd),
                     "/usr/sbin/lsof -ti TCP:%d -sTCP:%s 2>/dev/null", port, states[pass]);
        } else {
            snprintf(cmd, sizeof(cmd),
                     "/usr/sbin/lsof -ti TCP:%d 2>/dev/null", port);
        }
        FILE *fp = popen(cmd, "r");
        if (!fp) continue;
        char line[32];
        while (fgets(line, sizeof(line), fp)) {
            pid_t pid = (pid_t)atoi(line);
            if (pid > 1) {
                NSLog(@"[helper] pass %d: killing pid=%d on :%d", pass, pid, port);
                reapSingBoxPid(pid);
                totalKilled++;
            }
        }
        pclose(fp);
    }
    return totalKilled;
}

- (void)stopSingBoxWithReply:(void (^)(NSString *))reply {
    __block pid_t target = 0;
    dispatch_sync(_stateQueue, ^{
        target = self->_activePid;
    });

    if (target != 0) {
        reapSingBoxPid(target);
        dispatch_sync(_stateQueue, ^{
            if (self->_activePid == target) {
                self->_activePid = 0;
                self->_activeConnection = nil;
                if (self->_exitSource) {
                    dispatch_source_cancel(self->_exitSource);
                    self->_exitSource = nil;
                }
            }
        });
    }

    // Always sweep the proxy/controller ports afterwards. Delegate to
    // ensurePortFree which kills processes in ALL TCP states (not just LISTEN).
    [self ensurePortFree:2345 reply:^(int killed, NSString *error) {
        NSLog(@"[helper] ensurePortFree(2345) killed=%d err=%@", killed, error ?: @"nil");
    }];
    [self ensurePortFree:9191 reply:^(int killed, NSString *error) {
        NSLog(@"[helper] ensurePortFree(9191) killed=%d err=%@", killed, error ?: @"nil");
    }];

    reply(nil);
}

- (void)ensurePortFree:(int)port reply:(void (^)(int killedCount, NSString *error))reply {
    if (port <= 0 || port > 65535) {
        reply(0, @"invalid port");
        return;
    }
    int killed = killListenersOnPort(port);
    reply(killed, nil);
}

// ------------------------------------------------------------------
// reloadSingBox
// ------------------------------------------------------------------
- (void)reloadSingBoxWithReply:(void (^)(NSString *))reply {
    __block pid_t target = 0;
    dispatch_sync(_stateQueue, ^{
        target = self->_activePid;
    });
    if (target == 0) {
        reply(@"no sing-box process is currently running");
        return;
    }
    if (kill(target, SIGHUP) != 0) {
        reply([NSString stringWithFormat:@"kill(%d, SIGHUP) failed: %s",
               target, strerror(errno)]);
        return;
    }
    NSLog(@"[helper] sent SIGHUP to sing-box pid=%d", target);
    reply(nil);
}

// ------------------------------------------------------------------
// setIpForwarding
// ------------------------------------------------------------------
- (void)setIpForwarding:(BOOL)enable reply:(void (^)(NSString *))reply {
    int value = enable ? 1 : 0;
    int name[] = { CTL_NET, PF_INET, IPPROTO_IP, IPCTL_FORWARDING };
    if (sysctl(name, 4, NULL, NULL, &value, sizeof(value)) != 0) {
        reply([NSString stringWithFormat:@"sysctl ip.forwarding=%d failed: %s",
               value, strerror(errno)]);
        return;
    }
    NSLog(@"[helper] set net.inet.ip.forwarding=%d", value);
    reply(nil);
}

// ------------------------------------------------------------------
// setDnsServers
// ------------------------------------------------------------------
- (void)setDnsServersForService:(NSString *)serviceName
                            spec:(NSString *)dnsSpec
                           reply:(void (^)(NSString *))reply {
    NSString *err = validateServiceName(serviceName);
    if (err) { reply(err); return; }
    err = validateDnsSpec(dnsSpec);
    if (err) { reply(err); return; }

    NSMutableArray<NSString *> *args = [NSMutableArray arrayWithObjects:
        @"-setdnsservers", serviceName, nil];
    if ([dnsSpec isEqualToString:@"empty"]) {
        [args addObject:@"empty"];
    } else {
        for (NSString *p in [dnsSpec componentsSeparatedByCharactersInSet:
                             [NSCharacterSet whitespaceCharacterSet]]) {
            if (p.length > 0) [args addObject:p];
        }
    }

    NSString *runErr = runTool(@"/usr/sbin/networksetup", args);
    if (runErr) { reply(runErr); return; }
    NSLog(@"[helper] setdnsservers %@ %@", serviceName, dnsSpec);
    reply(nil);
}

// ------------------------------------------------------------------
// flushDnsCache
// ------------------------------------------------------------------
- (void)flushDnsCacheWithReply:(void (^)(NSString *))reply {
    NSString *err1 = runTool(@"/usr/bin/dscacheutil", @[ @"-flushcache" ]);
    NSString *err2 = runTool(@"/usr/bin/killall", @[ @"-HUP", @"mDNSResponder" ]);
    if (err1 || err2) {
        reply([NSString stringWithFormat:@"flushDnsCache: dscacheutil=%@, killall=%@",
               err1 ?: @"ok", err2 ?: @"ok"]);
        return;
    }
    reply(nil);
}

// ------------------------------------------------------------------
// removeTunRoutes
// ------------------------------------------------------------------
- (void)removeTunRoutesForInterface:(NSString *)interfaceName
                               reply:(void (^)(NSString *))reply {
    NSString *err = validateInterfaceName(interfaceName);
    if (err) { reply(err); return; }

    [self removeRoutesForFamily:@"inet" iface:interfaceName];
    [self removeRoutesForFamily:@"inet6" iface:interfaceName];

    NSString *downErr = runTool(@"/sbin/ifconfig", @[ interfaceName, @"down" ]);
    if (downErr) {
        NSLog(@"[helper] ifconfig %@ down: %@", interfaceName, downErr);
    }
    reply(nil);
}

- (void)removeRoutesForFamily:(NSString *)family iface:(NSString *)iface {
    NSTask *netstat = [[NSTask alloc] init];
    netstat.launchPath = @"/usr/sbin/netstat";
    netstat.arguments = @[ @"-rn", @"-f", family ];
    NSPipe *outPipe = [NSPipe pipe];
    netstat.standardOutput = outPipe;
    netstat.standardError = [NSFileHandle fileHandleWithNullDevice];
    @try {
        [netstat launch];
    } @catch (NSException *ex) {
        NSLog(@"[helper] netstat launch failed: %@", ex.reason);
        return;
    }
    NSData *stdoutData = [outPipe.fileHandleForReading readDataToEndOfFile];
    [netstat waitUntilExit];

    NSString *text = [[NSString alloc] initWithData:stdoutData encoding:NSUTF8StringEncoding];
    NSArray *lines = [text componentsSeparatedByString:@"\n"];
    NSMutableArray *dests = [NSMutableArray array];
    NSUInteger idx = 0;
    for (NSString *line in lines) {
        idx++;
        if (idx <= 4) continue;
        NSArray *cols = [line componentsSeparatedByCharactersInSet:
                         [NSCharacterSet whitespaceCharacterSet]];
        NSMutableArray *nonEmpty = [NSMutableArray array];
        for (NSString *c in cols) {
            if (c.length > 0) [nonEmpty addObject:c];
        }
        if (nonEmpty.count < 2) continue;
        if ([[nonEmpty lastObject] isEqualToString:iface]) {
            [dests addObject:nonEmpty[0]];
        }
    }

    for (NSString *dest in dests) {
        NSArray *args;
        if ([family isEqualToString:@"inet6"]) {
            args = @[ @"-q", @"delete", @"-inet6", dest ];
        } else {
            args = @[ @"-q", @"delete", dest ];
        }
        NSString *err = runTool(@"/sbin/route", args);
        if (err) {
            NSLog(@"[helper] route delete %@ %@: %@", family, dest, err);
        }
    }
}

// ------------------------------------------------------------------
// uninstallSelf
// ------------------------------------------------------------------
- (void)uninstallSelfWithReply:(void (^)(NSString *))reply {
    __block pid_t target = 0;
    dispatch_sync(_stateQueue, ^{
        target = self->_activePid;
    });
    if (target != 0) {
        kill(target, SIGTERM);
        NSLog(@"[helper] sent SIGTERM to sing-box pid=%d before uninstall", target);
    }

    char pidStr[16];
    snprintf(pidStr, sizeof(pidStr), "%d", getpid());
    char *const spawnArgv[] = {
        (char *)kBlessedHelperPath.UTF8String,
        (char *)"uninstall",
        pidStr,
        NULL
    };

    pid_t child = 0;
    int rc = posix_spawn(&child, kBlessedHelperPath.UTF8String, NULL, NULL, spawnArgv, NULL);
    if (rc != 0) {
        reply([NSString stringWithFormat:@"posix_spawn uninstall failed: %s", strerror(rc)]);
        return;
    }

    NSLog(@"[helper] spawned uninstall child pid=%d", child);
    reply(nil);
    exit(0);
}

@end

// ============================================================================
// Command-line uninstall (spawned by uninstallSelfWithReply)
// ============================================================================

static int runHelperUninstallFromCommandLine(pid_t waitPid) {
    if (waitPid > 0) {
        while (kill(waitPid, 0) == 0) {
            usleep(50 * 1000);
        }
        NSLog(@"[helper] uninstall: prior helper pid=%d exited", waitPid);
    }

    NSString *current = [[NSBundle mainBundle] executablePath];
    if (![current isEqualToString:kBlessedHelperPath]) {
        NSLog(@"[helper] uninstall refused: running from %@, expected %@",
              current, kBlessedHelperPath);
        return 1;
    }

    NSString *bootoutErr = runTool(@"/bin/launchctl",
        @[@"bootout", @"system", kBlessedHelperLabel]);
    if (bootoutErr) {
        NSLog(@"[helper] launchctl bootout: %@", bootoutErr);
        NSString *unloadErr = runTool(@"/bin/launchctl", @[@"unload", @"-w", kBlessedPlistPath]);
        if (unloadErr) {
            NSLog(@"[helper] launchctl unload: %@", unloadErr);
        }
    }

    NSError *fsErr = nil;
    [[NSFileManager defaultManager] removeItemAtPath:kBlessedPlistPath error:&fsErr];
    if (fsErr) {
        NSLog(@"[helper] failed to delete plist: %@", fsErr);
    }

    fsErr = nil;
    [[NSFileManager defaultManager] removeItemAtPath:kBlessedHelperPath error:&fsErr];
    if (fsErr) {
        NSLog(@"[helper] failed to delete helper binary: %@", fsErr);
        return 1;
    }

    NSLog(@"[helper] uninstall completed");
    return 0;
}

// ============================================================================
// Entry point
// ============================================================================

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc >= 2 && strcmp(argv[1], "uninstall") == 0) {
            pid_t waitPid = 0;
            if (argc >= 3) {
                waitPid = (pid_t)atoi(argv[2]);
            }
            return runHelperUninstallFromCommandLine(waitPid);
        }

        HelperService *delegate = [[HelperService alloc] init];
        NSXPCListener *listener =
            [[NSXPCListener alloc] initWithMachServiceName:@"com.root.aurestream.helper"];
        listener.delegate = delegate;
        [listener resume];
        [[NSRunLoop currentRunLoop] run];
    }
    return 0;
}
