use super::*;
use crate::testing::*;
use crate::Provider;

#[test]
fn bytes_that_are_nothing_are_malformed() {
    assert!(matches!(IncomingWelcome::parse(&[]), Err(MlsError::Malformed { .. })));
    assert!(matches!(IncomingGroupInfo::parse(&[]), Err(MlsError::Malformed { .. })));
    assert!(matches!(IncomingMessage::parse(&[]), Err(MlsError::Malformed { .. })));
    assert!(matches!(RatchetTree::parse(&[]), Err(MlsError::Malformed { .. })));
}

/// A Welcome is neither a GroupInfo nor a message, and a GroupInfo or a commit no Welcome.
#[test]
fn bytes_of_another_kind_are_malformed_where_they_dont_belong() {
    let (alice_p, mut alice_group, _, _) = alice_with_bob(b"conv-041");
    let charles_p = Provider::new();
    let charles = identity(&charles_p, b"charles");
    let add = alice_group
        .add_member(&alice_p, &charles.key_package(&charles_p).unwrap())
        .unwrap();

    assert!(matches!(IncomingGroupInfo::parse(&add.welcome), Err(MlsError::Malformed { .. })));
    assert!(matches!(IncomingMessage::parse(&add.welcome), Err(MlsError::Malformed { .. })));
    assert!(matches!(IncomingWelcome::parse(&add.group_info), Err(MlsError::Malformed { .. })));
    assert!(matches!(IncomingWelcome::parse(&add.commit), Err(MlsError::Malformed { .. })));
}
