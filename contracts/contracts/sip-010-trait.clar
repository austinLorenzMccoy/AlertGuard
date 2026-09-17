;; sip-010-trait.clar
;; Local copy of the standard SIP-010 fungible-token trait definition
;; (https://github.com/stacksgov/sips/blob/main/sips/sip-010/sip-010-fungible-token-standard.md)
;;
;; Kept local (rather than referencing a deployed mainnet/testnet contract)
;; so `guard-token.clar` has no external network dependency and can be
;; checked/tested fully offline with Clarinet's simnet.

(define-trait sip-010-trait
  (
    ;; Transfer from the caller to a new principal
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))

    ;; the human-readable name of the token
    (get-name () (response (string-ascii 32) uint))

    ;; the ticker symbol, or empty if none
    (get-symbol () (response (string-ascii 32) uint))

    ;; the number of decimals used, e.g. 6 would mean 1_000_000 represents 1 token
    (get-decimals () (response uint uint))

    ;; the balance of the passed principal
    (get-balance (principal) (response uint uint))

    ;; the current total supply (measured in the smallest denomination)
    (get-total-supply () (response uint uint))

    ;; an optional URI that represents metadata for this token
    (get-token-uri () (response (optional (string-utf8 256)) uint))
  )
)
