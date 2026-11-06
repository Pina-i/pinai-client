use super::*;

fn hex(s: &str) -> Vec<u8> {
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
        .collect()
}

/// RFC 9180 Appendix A.1.1: DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, AES-128-GCM, base mode.
mod rfc9180_a_1_1 {
    pub const INFO: &str = "4f6465206f6e2061204772656369616e2055726e";
    pub const IKM_E: &str = "7268600d403fce431561aef583ee1613527cff655c1343f29812e66706df3234";
    pub const PK_EM: &str = "37fda3567bdbd628e88668c3c8d7e97d1d1253b6d4ea6d44c150f741f1bf4431";
    pub const SK_EM: &str = "52c4a758a802cd8b936eceea314432798d5baf2d7e9235dc084ab1b9cfa2f736";
    pub const IKM_R: &str = "6db9df30aa07dd42ee5e8181afdb977e538f5e1fec8a06223f33f7013e525037";
    pub const PK_RM: &str = "3948cfe0ad1ddb695d780e59077195da6c56506b027329794ab02bca80815c4d";
    pub const SK_RM: &str = "4612c550263fc8ad58375df3f557aac531d26850903e55a9f23f21d8534e8ac8";
    pub const ENC: &str = "37fda3567bdbd628e88668c3c8d7e97d1d1253b6d4ea6d44c150f741f1bf4431";
    /// Sequence number 0: what a single-shot seal makes.
    pub const PT: &str = "4265617574792069732074727574682c20747275746820626561757479";
    pub const AAD: &str = "436f756e742d30";
    pub const CT: &str = "f938558b5d72f1a23810b4be2ab4f84331acc02fc97babc53a52ae8218a355a96d8770ac83d07bea87e13c512a";
}
use rfc9180_a_1_1 as v;

#[test]
fn the_recipient_key_pair_derives_as_the_rfc_vector_says() {
    let pair = derive(&hex(v::IKM_R)).unwrap();

    assert_eq!(pair.public_key, hex(v::PK_RM));
    assert_eq!(*pair.private_key, hex(v::SK_RM));
}

#[test]
fn the_ephemeral_key_pair_derives_to_the_vectors_enc() {
    let pair = derive(&hex(v::IKM_E)).unwrap();

    assert_eq!(pair.public_key, hex(v::PK_EM));
    assert_eq!(*pair.private_key, hex(v::SK_EM));
    assert_eq!(pair.public_key, hex(v::ENC));
}

#[test]
fn the_vectors_ciphertext_opens_to_its_plaintext() {
    let opened = open(
        &hex(v::SK_RM),
        &hex(v::ENC),
        &hex(v::CT),
        &hex(v::INFO),
        &hex(v::AAD),
    )
    .unwrap();

    assert_eq!(opened, hex(v::PT));
}

#[test]
fn the_vectors_ciphertext_opens_under_its_own_info_and_aad_only() {
    let other = b"pinai/history-key-share/v1";

    assert!(open(
        &hex(v::SK_RM),
        &hex(v::ENC),
        &hex(v::CT),
        other,
        &hex(v::AAD)
    )
    .is_err());
    assert!(open(
        &hex(v::SK_RM),
        &hex(v::ENC),
        &hex(v::CT),
        &hex(v::INFO),
        other
    )
    .is_err());
    assert!(open(
        &hex(v::SK_EM),
        &hex(v::ENC),
        &hex(v::CT),
        &hex(v::INFO),
        &hex(v::AAD)
    )
    .is_err());
}

#[test]
fn a_seal_opens_under_the_recipients_private_key() {
    let recipient = generate().unwrap();

    let sealed = seal(&recipient.public_key, b"info", b"aad", b"the 24 words").unwrap();

    assert_eq!(sealed.enc.len(), 32);
    assert_eq!(sealed.ciphertext.len(), b"the 24 words".len() + 16);
    let opened = open(
        &recipient.private_key,
        &sealed.enc,
        &sealed.ciphertext,
        b"info",
        b"aad",
    )
    .unwrap();
    assert_eq!(opened, b"the 24 words");
}

#[test]
fn each_seal_draws_its_own_ephemeral_key() {
    let recipient = generate().unwrap();

    let first = seal(&recipient.public_key, b"info", b"aad", b"same").unwrap();
    let second = seal(&recipient.public_key, b"info", b"aad", b"same").unwrap();

    assert_ne!(first.enc, second.enc);
}

#[test]
fn generated_key_pairs_are_distinct_x25519_keys() {
    let (a, b) = (generate().unwrap(), generate().unwrap());

    assert_eq!(a.public_key.len(), 32);
    assert_eq!(a.private_key.len(), 32);
    assert_ne!(a.public_key, b.public_key);
}

/// X25519 with a low-order point gives the all-zero shared secret: a sender must refuse it.
#[test]
fn a_low_order_public_key_is_refused() {
    assert!(seal(&[0; 32], b"info", b"aad", b"secret").is_err());
    let mut one = [0u8; 32];
    one[0] = 1;
    assert!(seal(&one, b"info", b"aad", b"secret").is_err());
}

#[test]
fn a_public_key_that_is_not_32_bytes_is_refused() {
    assert!(seal(&[9; 31], b"info", b"aad", b"secret").is_err());
}
