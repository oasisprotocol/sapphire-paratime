use memchr::memmem;

pub(crate) struct RequestTester {
    c10l_testers: [memmem::Finder<'static>; 3],
    disallowed_testers: [memmem::Finder<'static>; 1],
}

impl RequestTester {
    // Order these by frequency.
    const C10L_METHODS: [&'static str; 3] =
        ["eth_sendRawTransaction", "eth_call", "eth_estimateGas"];
    const DISALLOWED_METHODS: [&'static str; 1] = ["eth_transaction"];
}

impl Default for RequestTester {
    fn default() -> Self {
        Self {
            c10l_testers: Self::C10L_METHODS.map(|m| memmem::Finder::new(m.as_bytes())),
            disallowed_testers: Self::DISALLOWED_METHODS.map(|m| memmem::Finder::new(m.as_bytes())),
        }
    }
}

impl RequestTester {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    /// Quickly tests the bytes of a request (without parsing) to determine
    /// if it needs encryption or should be forwarded along to the upstream.
    pub(crate) fn preflight(&self, req_bytes: &[u8]) -> RequestClass {
        let test = |fs: &[memmem::Finder<'_>]| fs.iter().any(|f| f.find(req_bytes).is_some());
        if test(&self.c10l_testers) {
            RequestClass::Confidential
        } else if test(&self.disallowed_testers) {
            RequestClass::Disallowed
        } else {
            RequestClass::NonConfidential
        }
    }

    /// Checks whether the method is confidentiality-requiring.
    pub(crate) fn test(&self, req_method: &str) -> RequestClass {
        if Self::C10L_METHODS.iter().any(|&m| m == req_method) {
            RequestClass::Confidential
        } else if Self::DISALLOWED_METHODS.iter().any(|&m| m == req_method) {
            RequestClass::Disallowed
        } else {
            RequestClass::NonConfidential
        }
    }
}

pub(crate) enum RequestClass {
    Confidential,
    NonConfidential,
    Disallowed,
}
