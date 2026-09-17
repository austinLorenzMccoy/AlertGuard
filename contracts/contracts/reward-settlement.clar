;; reward-settlement.clar
;; AlertGuard reward settlement / minting-policy contract.
;;
;; Per AlertGuard Smart Contract PRD, Section 5: this contract is the ONLY
;; principal that guard-token.clar's authorized-minter should ever be set
;; to. It enforces:
;;   1. Owner-only settlement (the reward-pool operational wallet)
;;   2. Double-settlement prevention, keyed by the off-chain `reward_id`
;;      (Supabase `rewards.id`, a UUID encoded as a 36-byte buffer)
;;   3. A daily mint ceiling, enforced on-chain so a compromised backend key
;;      cannot drain the pool past the ceiling in a single day

(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u200))
(define-constant err-daily-cap-exceeded (err u201))
(define-constant err-already-settled (err u202))

;; Tracks which off-chain reward IDs have already been settled, to prevent double-mint
(define-map settled-rewards (buff 36) bool)

;; Daily mint ceiling - enforced on-chain, not just trusted to the backend
(define-data-var daily-mint-cap uint u5000000000) ;; example: 5,000 GUARD/day at 6 decimals
(define-data-var minted-today uint u0)
(define-data-var last-reset-block uint burn-block-height)

;; --- Daily-reset design decision -------------------------------------------
;; Clarity has no wall-clock time, only block heights. `burn-block-height`
;; (the underlying Bitcoin/L1 block height Stacks anchors to) is used rather
;; than the Stacks `block-height`, because Bitcoin block production is a
;; much steadier ~10-minute cadence than Stacks block/microblock production,
;; which varies. Assumption: ~10 minutes/burn-block => ~144 burn blocks/day
;; (24h * 60min / 10min). This is an approximation, not a guarantee - actual
;; Bitcoin block times drift, so the "day" this contract enforces is really
;; "~144 burn blocks", which will drift slowly relative to a calendar day
;; over time. That's an acceptable tradeoff for a spend-limiting safety
;; ceiling (Section 5/7 of the PRD): it only needs to be *approximately*
;; daily, not exact, to do its job of bounding worst-case daily mint volume.
;;
;; The reset is "lazy": rather than requiring a scheduled/external trigger,
;; every call to `settle-reward` first checks whether at least
;; `blocks-per-day` burn-blocks have elapsed since `last-reset-block`, and if
;; so, zeroes `minted-today` and advances `last-reset-block` before applying
;; the cap check for the current call. This keeps the contract fully
;; self-contained (no keeper/cron dependency) at the cost of the reset only
;; being observable/applied on the next settlement attempt after a day
;; boundary - which is fine, since `minted-today` is only ever consulted
;; from inside `settle-reward` itself.
(define-constant blocks-per-day u144)

(define-private (maybe-reset-daily-window)
  (if (>= (- burn-block-height (var-get last-reset-block)) blocks-per-day)
    (begin
      (var-set minted-today u0)
      (var-set last-reset-block burn-block-height)
      true
    )
    false
  )
)

(define-public (settle-reward (reward-id (buff 36)) (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (asserts! (is-none (map-get? settled-rewards reward-id)) err-already-settled)
    (maybe-reset-daily-window)
    (asserts! (<= (+ (var-get minted-today) amount) (var-get daily-mint-cap)) err-daily-cap-exceeded)

    (map-set settled-rewards reward-id true)
    (var-set minted-today (+ (var-get minted-today) amount))
    ;; guard-token's `mint` gates on `tx-sender` (see guard-token.clar), and
    ;; `tx-sender` is the ORIGINAL transaction signer for the whole call
    ;; stack in Clarity -- it does not become this contract's principal just
    ;; because this contract is the one making the `contract-call?`. Only
    ;; `contract-caller` would change on a plain nested call. So that
    ;; `guard-token.authorized-minter` can correctly be set to THIS
    ;; contract's principal (the PRD's "only the reward-settlement contract
    ;; may mint" requirement, Section 4), the inner call is wrapped in
    ;; `as-contract`, which makes this contract act as itself: tx-sender
    ;; becomes this contract's own principal for the duration of the inner
    ;; call only.
    (as-contract (contract-call? .guard-token mint amount recipient))
  )
)

(define-public (set-daily-cap (new-cap uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (ok (var-set daily-mint-cap new-cap))
  )
)

;; --- Read-only getters (test/ops introspection) -----------------------------

(define-read-only (get-daily-cap) (ok (var-get daily-mint-cap)))
(define-read-only (get-minted-today) (ok (var-get minted-today)))
(define-read-only (get-last-reset-block) (ok (var-get last-reset-block)))
(define-read-only (get-blocks-per-day) (ok blocks-per-day))
(define-read-only (get-contract-owner) (ok contract-owner))
(define-read-only (is-reward-settled (reward-id (buff 36)))
  (ok (is-some (map-get? settled-rewards reward-id)))
)
