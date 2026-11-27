use std::fmt::Display;

/// Why the engine said no, in the three ways a caller can tell apart.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum MlsError {
    /// Bytes from elsewhere — a peer, the DS, the device's own snapshot — that aren't what they claim.
    #[error("{what} could not be read: {detail}")]
    Malformed { what: &'static str, detail: String },
    /// openmls refused the operation or the message: a signature, an epoch, a tree.
    #[error("{operation} failed: {detail}")]
    Refused { operation: &'static str, detail: String },
    /// This device's own state forbids it: a commit pending, no leaf of its own, a key missing.
    #[error("{0}")]
    State(&'static str),
}

impl MlsError {
    pub(crate) fn malformed(what: &'static str, detail: impl Display) -> Self {
        Self::Malformed { what, detail: detail.to_string() }
    }

    pub(crate) fn refused(operation: &'static str, detail: impl Display) -> Self {
        Self::Refused { operation, detail: detail.to_string() }
    }
}

#[cfg(test)]
mod tests;
