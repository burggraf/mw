use crate::webrtc::{Peer, PeerType};
use std::thread;
use std::time::Duration;

#[test]
fn test_controller_has_higher_priority_than_display() {
    let controller = Peer::new(PeerType::Controller, "Controller".to_string());
    let display = Peer::new(PeerType::Display, "Display".to_string());
    assert!(controller.priority() > display.priority());
}

#[test]
fn test_earlier_startup_has_higher_priority() {
    let peer1 = Peer::new(PeerType::Controller, "Peer1".to_string());
    thread::sleep(Duration::from_millis(10));
    let peer2 = Peer::new(PeerType::Controller, "Peer2".to_string());
    assert!(peer1.priority() > peer2.priority());
}

#[test]
fn test_priority_ordering() {
    let p1 = Peer::new(PeerType::Display, "Display".to_string());
    thread::sleep(Duration::from_millis(10));
    let p2 = Peer::new(PeerType::Controller, "Controller".to_string());
    assert!(p2.priority() > p1.priority());
}
