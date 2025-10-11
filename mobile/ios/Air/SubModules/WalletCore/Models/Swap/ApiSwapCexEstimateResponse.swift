//
//  MSwapEstimate.swift
//  WalletCore
//
//  Created by Sina on 5/10/24.
//

import Foundation
import WalletContext

let DEFAULT_OUR_SWAP_FEE = 0.875

public struct NetworkFeeData {
    public let chain: ApiChain?
    public let isNativeIn: Bool
    public let fee: BigInt
}

public struct ApiSwapCexEstimateResponse: Equatable, Hashable, Codable, Sendable {
    public var from: String
    public var fromAmount: MDouble
    public var to: String
    public var toAmount: MDouble
    public let swapFee: MDouble
    // additional
    public var fromMin: MDouble?
    public var fromMax: MDouble?
    public var toMin: MDouble?
    public var toMax: MDouble?
    public var dieselStatus: DieselStatus?

    // Late-init properties
    public var isEnoughNative: Bool? = nil
    public var isDiesel: Bool? = nil
    
    mutating public func reverse() {
        (from, to) = (to, from)
        (fromAmount, toAmount) = (toAmount, fromAmount)
        (toMin, toMax) = (fromMin, fromMax)
    }
    
    public struct LateInitProperties {
        public var isEnoughNative: Bool
        public var isDiesel: Bool
        public var maxAmount: BigInt?
    }
    
    mutating public func calculateLateInitProperties(selling: TokenAmount, swapType: SwapType) {
        let props = ApiSwapCexEstimateResponse.calculateLateInitProperties(selling: selling,
                                                              swapType: swapType,
                                                              networkFee: nil,
                                                              dieselFee: nil,
                                                              ourFeePercent: nil)
        (isEnoughNative, isDiesel) = (props.isEnoughNative, props.isDiesel)
    }
    
    public static func calculateLateInitProperties(selling: TokenAmount,
                                                   swapType: SwapType,
                                                   networkFee: Double?,
                                                   dieselFee: Double?,
                                                   ourFeePercent: Double?) -> LateInitProperties {
        let tokenInChain = ApiChain(rawValue: selling.token.chain)
        let nativeUserTokenIn = selling.token.isOnChain == true ? TokenStore.tokens[tokenInChain?.tokenSlug ?? ""] : nil
        let networkFeeData = FeeEstimationHelpers.networkFeeBigInt(sellToken: selling.token, swapType: swapType, networkFee: networkFee)
        let totalNativeAmount = networkFeeData?.fee ?? 0 + (networkFeeData?.isNativeIn == true ? selling.amount : 0)
        let isEnoughNative = BalanceStore.currentAccountBalances[nativeUserTokenIn?.slug ?? ""] ?? 0 >= totalNativeAmount
        let isDiesel = swapType == SwapType.inChain && !isEnoughNative && DIESEL_TOKENS.contains(selling.token.tokenAddress ?? "")
        let maxAmount = calcMaxToSwap(selling: selling,
                                      swapType: swapType,
                                      networkFee: networkFee,
                                      dieselFee: dieselFee,
                                      ourFeePercent: ourFeePercent)
        return LateInitProperties(isEnoughNative: isEnoughNative, isDiesel: isDiesel, maxAmount: maxAmount)
    }
    
    private static func calcMaxToSwap(selling: TokenAmount,
                                      swapType: SwapType,
                                      networkFee: Double?,
                                      dieselFee: Double?,
                                      ourFeePercent: Double?) -> BigInt? {
        guard var balance = BalanceStore.currentAccountBalances[selling.token.slug] else {
            return nil
        }
        if selling.token.slug == ApiChain(rawValue: selling.token.chain)?.tokenSlug {
            if let networkFee {
                balance -= doubleToBigInt(networkFee, decimals: selling.token.decimals)
            }
        }
        if swapType == .inChain {
            if let dieselFee {
                balance -= doubleToBigInt(dieselFee, decimals: selling.decimals)
            }
            let ourFeePercent = ourFeePercent ?? DEFAULT_OUR_SWAP_FEE
            let tenPowerNine = BigInt(10).power(9)
            let feeMultiplier = BigInt((1.0 + (ourFeePercent / 100.0)) * 1_000_000_000)
            balance = balance * tenPowerNine / BigInt(1 + (ourFeePercent / 100)) / feeMultiplier
        }

        return balance
    }
}
