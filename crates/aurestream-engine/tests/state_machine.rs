use aurestream_engine::{EngineState, StateMachine};

#[test]
fn starting_to_running_ok() {
    let mut sm = StateMachine::new();
    sm.force(EngineState::Starting);
    assert!(sm.transition(EngineState::Running).is_ok());
    assert!(matches!(sm.state(), EngineState::Running));
}

#[test]
fn idle_to_starting_ok() {
    let mut sm = StateMachine::new();
    assert!(matches!(sm.state(), EngineState::Idle));
    assert!(sm.transition(EngineState::Starting).is_ok());
}

#[test]
fn idle_to_running_rejected() {
    let mut sm = StateMachine::new();
    assert!(sm.transition(EngineState::Running).is_err());
}

#[test]
fn running_to_stopping_to_idle_ok() {
    let mut sm = StateMachine::new();
    sm.force(EngineState::Running);
    assert!(sm.transition(EngineState::Stopping).is_ok());
    assert!(sm.transition(EngineState::Idle).is_ok());
}

#[test]
fn starting_to_failed_ok() {
    let mut sm = StateMachine::new();
    sm.force(EngineState::Starting);
    assert!(
        sm.transition(EngineState::Failed {
            reason: "boom".into()
        })
        .is_ok()
    );
}
