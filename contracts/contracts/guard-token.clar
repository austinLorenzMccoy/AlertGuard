;; guard-token.clar
;; AlertGuard SIP-010 fungible reward token ("GUARD")
;;
;; Per AlertGuard Smart Contract PRD, Section 4:
;; - A separate, minimal token contract that wallets/exchanges can integrate
;;   against directly and that should stay stable over time.
;; - Minting is gated behind an "authorized minter" (in production, the
;;   reward-settlement.clar contract) so all minting policy (double-settlement
;;   protection, daily caps, etc.) lives in reward-settlement.clar, not here.
;; - transfer is sender-gated: only tx-sender == sender may move their own
;;   funds, matching SIP-010's semantics.

;; --- SIP-010 trait conformance ---------------------------------------------
;; Implements the standard SIP-010 fungible-token trait function signatures:
;; transfer, get-name, get-symbol, get-decimals, get-balance,
;; get-total-supply, get-token-uri. The trait is defined locally in
;; sip-010-trait.clar so this contract has no external/mainnet dependency.
(impl-trait .sip-010-trait.sip-010-trait)

(define-fungible-token guard-token)

(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-not-authorized (err u101))

;; Only the reward-settlement contract (or, initially, the owner) may mint
(define-data-var authorized-minter principal contract-owner)

(define-public (set-authorized-minter (new-minter principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (ok (var-set authorized-minter new-minter))
  )
)

(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender (var-get authorized-minter)) err-not-authorized)
    (ft-mint? guard-token amount recipient)
  )
)

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) err-not-authorized)
    (ft-transfer? guard-token amount sender recipient)
  )
)

(define-read-only (get-balance (who principal))
  (ok (ft-get-balance guard-token who))
)

(define-read-only (get-name) (ok "AlertGuard Reward Token"))
(define-read-only (get-symbol) (ok "GUARD"))
(define-read-only (get-decimals) (ok u6))
(define-read-only (get-total-supply) (ok (ft-get-supply guard-token)))
(define-read-only (get-token-uri) (ok none))

;; --- Test/ops helper getters -------------------------------------------
(define-read-only (get-authorized-minter) (ok (var-get authorized-minter)))
(define-read-only (get-contract-owner) (ok contract-owner))
