// Objective-C shim bridging Rust to the AureStream privileged helper over XPC.
//
// Phase 2b.1 introduces a persistent NSXPCConnection + bidirectional XPC so
// the helper can push `singBoxDidExit` events back to the main app without
// polling. The connection is lazily created on first use, cached in a
// singleton, and recreated transparently after invalidation.
//
// Design notes:
// - Every call exposed to Rust blocks the caller on a dispatch semaphore
//   with a hard timeout. Rust wraps them in tokio::task::spawn_blocking so
//   the async runtime stays responsive.
// - All returned C strings are malloc'd and must be freed by the caller via
//   `aurestream_helper_free_string`. Passing NULL is safe.
// - Exit notifications from the helper flow through a client-side singleton
//   (`AureStreamHelperClient`) that implements `AureStreamHelperClientProtocol`.
//   The singleton forwards each event to an optional C callback registered
//   from Rust, which in turn bridges into a tokio channel.
// - This file is ARC-enabled (see build.rs -fobjc-arc flag). Do not insert
//   manual retain/release calls.

#import <Foundation/Foundation.h>
#import <ServiceManagement/ServiceManagement.h>
#import <Security/Authorization.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

static NSString *const kAureStreamHelperMachServiceName = @"com.root.aurestream.helper";
static const int64_t kAureStreamHelperDefaultTimeoutSeconds = 10;
static const int64_t kAureStreamHelperStartTimeoutSeconds = 30;

// These must exactly match the helper-side protocol signatures — any drift
// between the two sides silently breaks XPC method dispatch.
@protocol AureStreamHelperProtocol
- (void)pingWithReply:(void (^)(NSString *reply))reply;
- (void)startSingBoxWithConfigPath:(NSString *)configPath
                            logPath:(NSString *)logPath
                               reply:(void (^)(int pid, NSString *error))reply;
- (void)stopSingBoxWithReply:(void (^)(NSString *error))reply;
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

@protocol AureStreamHelperClientProtocol
- (void)singBoxDidExitWithPid:(int)pid exitCode:(int)exitCode;
@end

// ============================================================================
// C callback plumbing for async exit events
// ============================================================================

typedef void (*AureStreamHelperExitCallback)(int pid, int exit_code);
static AureStreamHelperExitCallback g_exitCallback = NULL;

void aurestream_helper_set_exit_callback(AureStreamHelperExitCallback cb) {
    g_exitCallback = cb;
}

// ============================================================================
// Persistent connection singleton
// ============================================================================

@interface AureStreamHelperClient : NSObject <AureStreamHelperClientProtocol>
+ (instancetype)sharedClient;
- (NSXPCConnection *)connection;
- (void)invalidate;
@end

@implementation AureStreamHelperClient {
    NSXPCConnection *_connection;
    NSLock *_connectionLock;
}

+ (instancetype)sharedClient {
    static AureStreamHelperClient *instance = nil;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        instance = [[AureStreamHelperClient alloc] init];
    });
    return instance;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _connectionLock = [[NSLock alloc] init];
    }
    return self;
}

- (NSXPCConnection *)connection {
    [_connectionLock lock];
    if (_connection == nil) {
        NSXPCConnection *conn = [[NSXPCConnection alloc]
            initWithMachServiceName:kAureStreamHelperMachServiceName
                            options:NSXPCConnectionPrivileged];
        conn.remoteObjectInterface =
            [NSXPCInterface interfaceWithProtocol:@protocol(AureStreamHelperProtocol)];
        conn.exportedInterface =
            [NSXPCInterface interfaceWithProtocol:@protocol(AureStreamHelperClientProtocol)];
        conn.exportedObject = self;

        __weak AureStreamHelperClient *weakSelf = self;
        conn.invalidationHandler = ^{
            NSLog(@"[client] XPC connection invalidated");
            AureStreamHelperClient *strongSelf = weakSelf;
            if (strongSelf) {
                [strongSelf->_connectionLock lock];
                strongSelf->_connection = nil;
                [strongSelf->_connectionLock unlock];
            }
        };
        conn.interruptionHandler = ^{
            NSLog(@"[client] XPC connection interrupted");
        };

        [conn resume];
        _connection = conn;
    }
    NSXPCConnection *result = _connection;
    [_connectionLock unlock];
    return result;
}

- (void)invalidate {
    [_connectionLock lock];
    NSXPCConnection *conn = _connection;
    _connection = nil;
    [_connectionLock unlock];
    [conn invalidate];
}

// Helper -> client exit notification. This is the only method the helper
// ever calls on us — everything else is client-initiated. Dispatch to the
// C callback if Rust has registered one.
- (void)singBoxDidExitWithPid:(int)pid exitCode:(int)exitCode {
    NSLog(@"[client] sing-box exit notification pid=%d code=%d", pid, exitCode);
    AureStreamHelperExitCallback cb = g_exitCallback;
    if (cb != NULL) {
        cb(pid, exitCode);
    }
}

@end

// ============================================================================
// Shared utilities
// ============================================================================

static char *aurestream_copy_cstring(NSString *s) {
    if (s == nil) {
        return NULL;
    }
    const char *utf8 = [s UTF8String];
    if (utf8 == NULL) {
        return NULL;
    }
    size_t len = strlen(utf8);
    char *out = malloc(len + 1);
    if (out == NULL) {
        return NULL;
    }
    memcpy(out, utf8, len + 1);
    return out;
}

void aurestream_helper_free_string(char *s) {
    if (s != NULL) {
        free(s);
    }
}

static NSString *aurestream_xpc_error_message(NSError *error) {
    return [NSString stringWithFormat:@"xpc error: %@",
            error.localizedDescription ?: @"(nil)"];
}

// Shared template for simple "fire and forget with error reply" methods
// that only return a NSString* error. Returns 0 on success, non-zero on
// failure with *error_out set to an allocated C string.
typedef void (^AureStreamHelperInvokeBlock)(id<AureStreamHelperProtocol> proxy,
                                         void (^replyHandler)(NSString *error));

static int invokeErrorOnly(AureStreamHelperInvokeBlock block,
                           int64_t timeoutSeconds,
                           char **error_out) {
    if (error_out != NULL) {
        *error_out = NULL;
    }

    @autoreleasepool {
        NSXPCConnection *conn = [[AureStreamHelperClient sharedClient] connection];

        __block NSString *errString = nil;
        __block BOOL completed = NO;
        __block BOOL xpcError = NO;
        dispatch_semaphore_t sem = dispatch_semaphore_create(0);

        id<AureStreamHelperProtocol> proxy = [conn remoteObjectProxyWithErrorHandler:^(NSError *err) {
            if (!completed) {
                xpcError = YES;
                errString = aurestream_xpc_error_message(err);
                completed = YES;
                dispatch_semaphore_signal(sem);
            }
        }];

        block(proxy, ^(NSString *replyError) {
            if (!completed) {
                errString = replyError;
                completed = YES;
                dispatch_semaphore_signal(sem);
            }
        });

        dispatch_time_t deadline = dispatch_time(
            DISPATCH_TIME_NOW, timeoutSeconds * NSEC_PER_SEC);
        if (dispatch_semaphore_wait(sem, deadline) != 0) {
            [[AureStreamHelperClient sharedClient] invalidate];
            if (error_out != NULL) {
                *error_out = aurestream_copy_cstring(@"timeout waiting for helper reply");
            }
            return 1;
        }

        if (xpcError) {
            [[AureStreamHelperClient sharedClient] invalidate];
        }

        if (errString == nil) {
            return 0;
        }
        if (error_out != NULL) {
            *error_out = aurestream_copy_cstring(errString);
        }
        return 1;
    }
}

static int invokeErrorOnlyWithRetry(AureStreamHelperInvokeBlock block,
                                    int64_t timeoutSeconds,
                                    char **error_out) {
    char *firstError = NULL;
    int rc = invokeErrorOnly(block, timeoutSeconds, &firstError);
    if (rc == 0) {
        if (firstError != NULL) free(firstError);
        if (error_out != NULL) *error_out = NULL;
        return 0;
    }

    NSString *first = firstError == NULL
        ? @"unknown helper error"
        : [NSString stringWithUTF8String:firstError];
    BOOL retryable = [first hasPrefix:@"xpc error:"];
    if (firstError != NULL) free(firstError);

    if (!retryable) {
        if (error_out != NULL) *error_out = aurestream_copy_cstring(first);
        return rc;
    }

    NSLog(@"[client] retrying helper call after XPC error: %@", first);
    [[AureStreamHelperClient sharedClient] invalidate];
    return invokeErrorOnly(block, timeoutSeconds, error_out);
}

// ============================================================================
// Capability exports
// ============================================================================

int aurestream_helper_ping(char **reply_out) {
    if (reply_out != NULL) {
        *reply_out = NULL;
    }

    @autoreleasepool {
        NSXPCConnection *conn = [[AureStreamHelperClient sharedClient] connection];

        __block NSString *successReply = nil;
        __block NSString *errorReply = nil;
        __block BOOL completed = NO;
        __block BOOL xpcError = NO;
        dispatch_semaphore_t sem = dispatch_semaphore_create(0);

        id<AureStreamHelperProtocol> proxy = [conn remoteObjectProxyWithErrorHandler:^(NSError *error) {
            if (!completed) {
                xpcError = YES;
                errorReply = aurestream_xpc_error_message(error);
                completed = YES;
                dispatch_semaphore_signal(sem);
            }
        }];

        [proxy pingWithReply:^(NSString *reply) {
            if (!completed) {
                successReply = [reply copy];
                completed = YES;
                dispatch_semaphore_signal(sem);
            }
        }];

        dispatch_time_t deadline = dispatch_time(
            DISPATCH_TIME_NOW, kAureStreamHelperDefaultTimeoutSeconds * NSEC_PER_SEC);
        if (dispatch_semaphore_wait(sem, deadline) != 0) {
            [[AureStreamHelperClient sharedClient] invalidate];
            if (reply_out != NULL) {
                *reply_out = aurestream_copy_cstring(@"timeout waiting for helper reply");
            }
            return 2;
        }

        if (xpcError) {
            [[AureStreamHelperClient sharedClient] invalidate];
        }

        if (successReply != nil) {
            if (reply_out != NULL) {
                *reply_out = aurestream_copy_cstring(successReply);
            }
            return 0;
        }
        if (reply_out != NULL) {
            *reply_out = aurestream_copy_cstring(errorReply ?: @"unknown helper error");
        }
        return 1;
    }
}

static int aurestream_helper_start_sing_box_once(NSString *configPath,
                                                 NSString *logPath,
                                                 int *pid_out,
                                                 NSString **error_string_out,
                                                 BOOL *xpc_error_out) {
    if (pid_out != NULL) *pid_out = 0;
    if (error_string_out != NULL) *error_string_out = nil;
    if (xpc_error_out != NULL) *xpc_error_out = NO;

    NSXPCConnection *conn = [[AureStreamHelperClient sharedClient] connection];

    __block int resultPid = 0;
    __block NSString *errString = nil;
    __block BOOL completed = NO;
    __block BOOL xpcError = NO;
    dispatch_semaphore_t sem = dispatch_semaphore_create(0);

    id<AureStreamHelperProtocol> proxy = [conn remoteObjectProxyWithErrorHandler:^(NSError *err) {
        if (!completed) {
            xpcError = YES;
            errString = aurestream_xpc_error_message(err);
            completed = YES;
            dispatch_semaphore_signal(sem);
        }
    }];

    [proxy startSingBoxWithConfigPath:configPath
                              logPath:logPath
                                reply:^(int pid, NSString *error) {
        if (!completed) {
            resultPid = pid;
            errString = error;
            completed = YES;
            dispatch_semaphore_signal(sem);
        }
    }];

    dispatch_time_t deadline = dispatch_time(
        DISPATCH_TIME_NOW, kAureStreamHelperStartTimeoutSeconds * NSEC_PER_SEC);
    if (dispatch_semaphore_wait(sem, deadline) != 0) {
        [[AureStreamHelperClient sharedClient] invalidate];
        if (error_string_out != NULL) *error_string_out = @"timeout waiting for startSingBox reply";
        return 1;
    }

    if (pid_out != NULL) *pid_out = resultPid;
    if (xpc_error_out != NULL) *xpc_error_out = xpcError;

    if (resultPid > 0 && errString == nil) {
        return 0;
    }
    if (error_string_out != NULL) *error_string_out = errString ?: @"unknown helper error";
    return 1;
}

int aurestream_helper_start_sing_box(const char *config_path,
                                  const char *log_path,
                                  int *pid_out,
                                  char **error_out) {
    if (pid_out != NULL) *pid_out = 0;
    if (error_out != NULL) *error_out = NULL;

    if (config_path == NULL) {
        if (error_out != NULL) {
            *error_out = aurestream_copy_cstring(@"config_path is null");
        }
        return 1;
    }
    if (log_path == NULL) {
        if (error_out != NULL) {
            *error_out = aurestream_copy_cstring(@"log_path is null");
        }
        return 1;
    }

    @autoreleasepool {
        NSString *configPath = [NSString stringWithUTF8String:config_path];
        NSString *logPath = [NSString stringWithUTF8String:log_path];
        NSString *lastError = nil;

        for (int attempt = 0; attempt < 2; attempt++) {
            BOOL xpcError = NO;
            int rc = aurestream_helper_start_sing_box_once(
                configPath, logPath, pid_out, &lastError, &xpcError);
            if (rc == 0) {
                return 0;
            }
            if (!xpcError) {
                break;
            }

            [[AureStreamHelperClient sharedClient] invalidate];
            NSLog(@"[client] retrying startSingBox after XPC error: %@", lastError ?: @"(nil)");
        }

        if (error_out != NULL) {
            *error_out = aurestream_copy_cstring(lastError ?: @"unknown helper error");
        }
        return 1;
    }
}

int aurestream_helper_stop_sing_box(char **error_out) {
    return invokeErrorOnlyWithRetry(^(id<AureStreamHelperProtocol> proxy, void (^replyHandler)(NSString *)) {
        [proxy stopSingBoxWithReply:replyHandler];
    }, kAureStreamHelperDefaultTimeoutSeconds, error_out);
}

int aurestream_helper_reload_sing_box(char **error_out) {
    return invokeErrorOnlyWithRetry(^(id<AureStreamHelperProtocol> proxy, void (^replyHandler)(NSString *)) {
        [proxy reloadSingBoxWithReply:replyHandler];
    }, kAureStreamHelperDefaultTimeoutSeconds, error_out);
}

int aurestream_helper_set_ip_forwarding(bool enable, char **error_out) {
    BOOL objcBool = enable ? YES : NO;
    return invokeErrorOnlyWithRetry(^(id<AureStreamHelperProtocol> proxy, void (^replyHandler)(NSString *)) {
        [proxy setIpForwarding:objcBool reply:replyHandler];
    }, kAureStreamHelperDefaultTimeoutSeconds, error_out);
}

int aurestream_helper_set_dns_servers(const char *service_name,
                                   const char *dns_spec,
                                   char **error_out) {
    if (service_name == NULL || dns_spec == NULL) {
        if (error_out != NULL) {
            *error_out = aurestream_copy_cstring(@"service_name or dns_spec is null");
        }
        return 1;
    }
    NSString *serviceName = [NSString stringWithUTF8String:service_name];
    NSString *dnsSpec = [NSString stringWithUTF8String:dns_spec];
    return invokeErrorOnlyWithRetry(^(id<AureStreamHelperProtocol> proxy, void (^replyHandler)(NSString *)) {
        [proxy setDnsServersForService:serviceName spec:dnsSpec reply:replyHandler];
    }, kAureStreamHelperDefaultTimeoutSeconds, error_out);
}

int aurestream_helper_flush_dns_cache(char **error_out) {
    return invokeErrorOnlyWithRetry(^(id<AureStreamHelperProtocol> proxy, void (^replyHandler)(NSString *)) {
        [proxy flushDnsCacheWithReply:replyHandler];
    }, kAureStreamHelperDefaultTimeoutSeconds, error_out);
}

int aurestream_helper_remove_tun_routes(const char *interface_name, char **error_out) {
    if (interface_name == NULL) {
        if (error_out != NULL) {
            *error_out = aurestream_copy_cstring(@"interface_name is null");
        }
        return 1;
    }
    NSString *iface = [NSString stringWithUTF8String:interface_name];
    return invokeErrorOnlyWithRetry(^(id<AureStreamHelperProtocol> proxy, void (^replyHandler)(NSString *)) {
        [proxy removeTunRoutesForInterface:iface reply:replyHandler];
    }, kAureStreamHelperDefaultTimeoutSeconds, error_out);
}

// ============================================================================
// SMJobBless install path (unchanged from Phase 1c)
// ============================================================================

// Installs (or upgrades) the privileged helper via SMJobBless. Blocks the
// calling thread while the authorization prompt is on screen — callers should
// invoke this from a background tokio task, not the UI thread.
//
// Returns 0 on success. On any failure, *error_out receives an allocated C
// string describing the error and the return code is non-zero. The caller
// owns *error_out and must free it via aurestream_helper_free_string.
//
// SMJobBless is deprecated on macOS 13+ in favor of SMAppService, but it
// still works through Sequoia and remains the only option when supporting
// macOS 10.15–12. The deprecation warning is suppressed locally.
int aurestream_helper_install(char **error_out) {
    if (error_out != NULL) {
        *error_out = NULL;
    }

    @autoreleasepool {
        AuthorizationRef authRef = NULL;
        OSStatus status = AuthorizationCreate(
            NULL,
            kAuthorizationEmptyEnvironment,
            kAuthorizationFlagDefaults,
            &authRef);
        if (status != errAuthorizationSuccess || authRef == NULL) {
            if (error_out != NULL) {
                *error_out = aurestream_copy_cstring(
                    [NSString stringWithFormat:@"AuthorizationCreate failed: %d", (int)status]);
            }
            return 1;
        }

        AuthorizationItem authItem = {
            kSMRightBlessPrivilegedHelper, 0, NULL, 0
        };
        AuthorizationRights authRights = { 1, &authItem };
        AuthorizationFlags flags =
            kAuthorizationFlagDefaults
            | kAuthorizationFlagInteractionAllowed
            | kAuthorizationFlagPreAuthorize
            | kAuthorizationFlagExtendRights;

        status = AuthorizationCopyRights(
            authRef, &authRights, kAuthorizationEmptyEnvironment, flags, NULL);
        if (status != errAuthorizationSuccess) {
            AuthorizationFree(authRef, kAuthorizationFlagDefaults);
            if (error_out != NULL) {
                NSString *msg;
                if (status == errAuthorizationCanceled) {
                    msg = @"authorization canceled by user";
                } else {
                    msg = [NSString stringWithFormat:@"AuthorizationCopyRights failed: %d", (int)status];
                }
                *error_out = aurestream_copy_cstring(msg);
            }
            return 2;
        }

        CFErrorRef cfError = NULL;
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
        Boolean ok = SMJobBless(
            kSMDomainSystemLaunchd,
            CFSTR("com.root.aurestream.helper"),
            authRef,
            &cfError);
#pragma clang diagnostic pop

        AuthorizationFree(authRef, kAuthorizationFlagDestroyRights);

        if (!ok) {
            NSError *err = (__bridge_transfer NSError *)cfError;
            if (error_out != NULL) {
                *error_out = aurestream_copy_cstring(
                    [NSString stringWithFormat:@"SMJobBless failed: %@",
                     err.localizedDescription ?: @"(unknown)"]);
            }
            return 3;
        }

        // SMJobBless just replaced the helper process; the old mach port is
        // destroyed. The OS invalidationHandler fires asynchronously on an XPC
        // private queue, so a post-bless caller may race it and return the
        // stale _connection pointing at the dead port (first XPC call then
        // errors with "Couldn't communicate..."). Drop the cache synchronously
        // so the next -[AureStreamHelperClient connection] lazily rebuilds against
        // the new helper's fresh mach port.
        [[AureStreamHelperClient sharedClient] invalidate];

        return 0;
    }
}

int aurestream_helper_uninstall(char **error_out) {
    int rc = invokeErrorOnly(^(id<AureStreamHelperProtocol> proxy, void (^replyHandler)(NSString *)) {
        [proxy uninstallSelfWithReply:replyHandler];
    }, kAureStreamHelperDefaultTimeoutSeconds, error_out);
    [[AureStreamHelperClient sharedClient] invalidate];
    return rc;
}
