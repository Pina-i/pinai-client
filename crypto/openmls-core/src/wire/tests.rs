use super::*;

#[test]
fn bytes_that_are_nothing_are_malformed() {
    assert!(matches!(IncomingWelcome::parse(&[]), Err(MlsError::Malformed { .. })));
    assert!(matches!(IncomingGroupInfo::parse(&[]), Err(MlsError::Malformed { .. })));
    assert!(matches!(IncomingMessage::parse(&[]), Err(MlsError::Malformed { .. })));
    assert!(matches!(RatchetTree::parse(&[]), Err(MlsError::Malformed { .. })));
}
