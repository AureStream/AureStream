use std::time::Instant;

/// Logs elapsed time on drop — for coarse-grained start/reload profiling.
pub struct StepTimer {
    label: &'static str,
    start: Instant,
}

impl StepTimer {
    pub fn new(label: &'static str) -> Self {
        Self {
            label,
            start: Instant::now(),
        }
    }
}

impl Drop for StepTimer {
    fn drop(&mut self) {
        log::info!(
            "[perf] {} {}ms",
            self.label,
            self.start.elapsed().as_millis()
        );
    }
}
