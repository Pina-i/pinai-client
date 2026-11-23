use super::*;

/// Alice's and Bob's providers, one group between them, as the crate wrote them before the split.
const ALICE_BEFORE: &[u8] = include_bytes!("../../fixtures/snapshot-before-split/alice.bin");
const BOB_BEFORE: &[u8] = include_bytes!("../../fixtures/snapshot-before-split/bob.bin");

#[test]
fn a_snapshot_written_before_the_split_reads_back_whole() {
    for before in [ALICE_BEFORE, BOB_BEFORE] {
        let provider = Provider::new();
        provider.deserialize_storage(before).unwrap();

        let again = provider.serialize_storage().unwrap();

        let values = decode_snapshot(before).unwrap();
        assert!(!values.is_empty());
        assert_eq!(decode_snapshot(&again).unwrap(), values);
    }
}

#[test]
fn a_snapshot_reads_back_as_it_was_written() {
    let provider = Provider::new();
    provider.0.storage().values.write().unwrap().extend([
        (b"key".to_vec(), b"value".to_vec()),
        (Vec::new(), vec![7; 300]),
    ]);
    let restored = Provider::new();

    restored.deserialize_storage(&provider.serialize_storage().unwrap()).unwrap();

    assert_eq!(
        *restored.0.storage().values.read().unwrap(),
        *provider.0.storage().values.read().unwrap()
    );
}

#[test]
fn a_cut_snapshot_is_malformed() {
    let provider = Provider::new();
    provider.0.storage().values.write().unwrap().insert(b"key".to_vec(), b"value".to_vec());
    let whole = provider.serialize_storage().unwrap();

    for cut in [0, 4, 8, 20, whole.len() - 1] {
        assert!(
            matches!(Provider::new().deserialize_storage(&whole[..cut]), Err(MlsError::Malformed { .. })),
            "cut at {cut}"
        );
    }
}
