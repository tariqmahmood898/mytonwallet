
import WalletContext

public protocol ApiFee {
    var fee: BigInt? { get }
    var realFee: BigInt? { get }
    var diesel: MDiesel? { get }
}

extension MTransactionDraft: ApiFee {}


public struct ExplainedTransferFee: Equatable, Hashable, Codable, Sendable {
    
    public typealias FeeDetails = MFee
    
    /** Whether the result implies paying the fee with a diesel */
    public var isGasless: Bool
    
    /**
     * Whether the full token balance can be transferred despite the fee.
     * If yes, the fee will be taken from the transferred amount.
     */
    public var canTransferFullBalance: Bool
    
    /**
     * The fee that will be sent with the transfer. The wallet must have it on the balance to send the transfer.
     * Show this in the transfer form when the input amount is ≤ the balance, but the remaining balance can't cover the
     * full fee; show `realFee` otherwise. Undefined means that it's unknown.
     */
    public var fullFee: FeeDetails?
    
    /**
     * The real fee (the full fee minus the excess). Undefined means that it's unknown. There is no need to fall back to
     * `fullFee` when `realFee` is undefined (because it's undefined too in this case).
     */
    public var realFee: FeeDetails?
    
    /** The excess fee. Measured in the native token. It's always approximate. Undefined means that it's unknown. */
    public var excessFee: BigInt
}

struct MaxTransferAmountInput {
    /** The wallet balance of the transferred token. Undefined means that it's unknown. */
    var tokenBalance: BigInt?
    /** The slug of the token that is being transferred */
    var tokenSlug: String
    /** The full fee terms calculated by `explainApiTransferFee`. Undefined means that they're unknown. */
    var fullFee: MFee.FeeTerms?
    /** Whether the full token balance can be transferred despite the fee. */
    var canTransferFullBalance: Bool
}

public struct BalanceSufficientForTransferInput {
    /** The wallet balance of the transferred token. Undefined means that it's unknown. */
    var tokenBalance: BigInt?
    /** The full fee terms calculated by `explainApiTransferFee`. Undefined means that they're unknown. */
    var fullFee: MFee.FeeTerms?
    /** Whether the full token balance can be transferred despite the fee. */
    var canTransferFullBalance: Bool
    /** The wallet balance of the native token of the transfer chain. Undefined means that it's unknown. */
    var nativeTokenBalance: BigInt?
    /** The transferred amount. Use 0 for NFT transfers. Undefined means that it's unspecified. */
    var transferAmount: BigInt?
    
    public init(tokenBalance: BigInt? = nil, fullFee: MFee.FeeTerms? = nil, canTransferFullBalance: Bool, nativeTokenBalance: BigInt? = nil, transferAmount: BigInt? = nil) {
        self.tokenBalance = tokenBalance
        self.fullFee = fullFee
        self.canTransferFullBalance = canTransferFullBalance
        self.nativeTokenBalance = nativeTokenBalance
        self.transferAmount = transferAmount
    }
}

/**
 * Converts the transfer fee data returned from API into data that is ready to be displayed in the transfer form UI.
 */
public func explainApiTransferFee(input: ApiFee, tokenSlug: String) -> ExplainedTransferFee {
    return shouldUseDiesel(input)
    ? explainGaslessTransferFee(input)
    : explainGasfullTransferFee(input, tokenSlug: tokenSlug);
}

/**
 * Calculates the maximum amount available for the transfer.
 * Returns undefined when it can't be calculated because of insufficient input data.
 */
func getMaxTransferAmount(_ input: MaxTransferAmountInput) -> BigInt? {
    guard let tokenBalance = input.tokenBalance else {
        return nil
    }
    
    // Returning the full balance when the fee is unknown for a better UX
    if (input.canTransferFullBalance || input.fullFee == nil) {
        return input.tokenBalance
    }
    
    var fee = input.fullFee?.token ?? .zero
    if let token = TokenStore.tokens[input.tokenSlug], token.isNative {
        // When the token is native, both `token` and `native` refer to the same currency, so they should be added
        fee += input.fullFee?.native ?? .zero;
    }
    
    return max(tokenBalance - fee, 0)
}

/**
 * Decides whether the balance is sufficient to transfer the amount and pay the fees.
 * Returns undefined when it can't be calculated because of insufficient input data.
 */
public func isBalanceSufficientForTransfer(_ input: BalanceSufficientForTransferInput) -> Bool? {
    guard let transferAmount = input.transferAmount, let tokenBalance = input.tokenBalance, let nativeTokenBalance = input.nativeTokenBalance, let fullFee = input.fullFee else {
        return nil
    }
    
    let isFullTokenTransfer = transferAmount == tokenBalance && input.canTransferFullBalance
    let tokenRequiredAmount = (fullFee.token ?? .zero) + (isFullTokenTransfer ? .zero : transferAmount)
    let nativeTokenRequiredAmount = fullFee.native ?? .zero
    
    return tokenRequiredAmount <= tokenBalance && nativeTokenRequiredAmount <= nativeTokenBalance
}

public func isDieselAvailable(_ diesel: ApiFetchEstimateDieselResult) -> Bool {
    return diesel.status != .notAvailable && diesel.amount != nil
}

public func getDieselTokenAmount(diesel: ApiFetchEstimateDieselResult) -> BigInt {
    return diesel.status == .starsFee ? .zero : (diesel.amount ?? .zero);
}

public func shouldUseDiesel(_ input: ApiFee) -> Bool {
    if let diesel = input.diesel {
        return isDieselAvailable(diesel)
    }
    return false
}

/**
 * Converts the data of a transfer not involving diesel
 */
private func explainGasfullTransferFee(_ input: ApiFee, tokenSlug: String) -> ExplainedTransferFee {
    var result = ExplainedTransferFee(
        isGasless: false,
        canTransferFullBalance: tokenSlug == TONCOIN_SLUG,
        fullFee: nil,
        realFee: nil,
        excessFee: .zero
    )
    
    if let inputFee = input.fee {
        result.fullFee = .init(
            precision: input.realFee == input.fee ? .exact : .lessThan,
            terms: .init(token: nil, native: input.fee, stars: nil),
            nativeSum: inputFee
        )
        result.realFee = result.fullFee
    }
    
    if let realFee = input.realFee {
        result.realFee = .init(
            precision: realFee == input.fee ? .exact : .approximate,
            terms: .init(token: nil, native: input.realFee, stars: nil),
            nativeSum: realFee
        )
    }
    
    if let inputFee = input.fee, let realFee = input.realFee {
        result.excessFee = inputFee - realFee
    }
    
    return result
}

/**
 * Converts the diesel of semi-diesel transfer data
 */
private func explainGaslessTransferFee(_ fee: ApiFee) -> ExplainedTransferFee {
    let diesel = fee.diesel ?? MDiesel(status: .notAvailable, amount: nil, nativeAmount: 0, remainingFee: 0, realFee: 0)
    let isStarsDiesel = diesel.status == .starsFee
    let realFeeInDiesel = convertFee(amount: diesel.realFee, exampleFromAmount: diesel.nativeAmount, exampleToAmount: diesel.amount ?? .zero)
    // Cover as much displayed real fee as possible with diesel, because in the excess it will return as the native token.
    let dieselRealFee = min(diesel.amount ?? .zero, realFeeInDiesel)
    // Cover the remaining real fee with the native token.
    let nativeRealFee = max(.zero, diesel.realFee - diesel.nativeAmount)
    
    return .init(
        isGasless: true,
        canTransferFullBalance: false,
        fullFee: .init(
            precision: .lessThan,
            terms: .init(
                token: isStarsDiesel ? nil : diesel.amount,
                native: diesel.remainingFee,
                stars: isStarsDiesel ? diesel.amount : nil
            ),
            nativeSum: diesel.nativeAmount + diesel.remainingFee
        ),
        realFee: .init(
            precision: .approximate,
            terms: .init(
                token: isStarsDiesel ? nil : dieselRealFee,
                native: nativeRealFee,
                stars: isStarsDiesel ? dieselRealFee : nil
            ),
            nativeSum: diesel.realFee
        ),
        excessFee: diesel.nativeAmount + diesel.remainingFee - diesel.realFee
    )
}

/**
 * `exampleFromAmount` and `exampleToAmount` define the exchange rate used to convert `amount`.
 * `exampleFromAmount` is defined in the same currency as `amount`. Mustn't be 0.
 * `exampleToAmount` is defined in the currency you want to get.
 */
public func convertFee(
    amount: BigInt,
    exampleFromAmount: BigInt,
    exampleToAmount: BigInt
) -> BigInt {
    if exampleFromAmount == 0 { return amount }
    return amount * exampleToAmount / exampleFromAmount
}
