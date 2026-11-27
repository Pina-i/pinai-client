use super::*;

#[test]
fn each_case_says_what_went_wrong() {
    assert_eq!(
        MlsError::malformed("Welcome", "end of input").to_string(),
        "Welcome could not be read: end of input"
    );
    assert_eq!(
        MlsError::refused("Commit", "wrong epoch").to_string(),
        "Commit failed: wrong epoch"
    );
    assert_eq!(
        MlsError::State("A commit of this group is still pending").to_string(),
        "A commit of this group is still pending"
    );
}
