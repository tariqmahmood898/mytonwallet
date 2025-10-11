//
//  SwapCexSupport.swift
//  UISwap
//
//  Created by nikstar on 31.08.2025.
//

import Foundation
import WalletCore
import WalletContext

enum SwapCexSupport {
    public static func swapCexCreateTransaction(
        sellingToken: ApiToken?,
        params: ApiSwapCexCreateTransactionParams,
        shouldTransfer: Bool,
        passcode: String
    ) async throws -> ApiActivity? {
        guard let sellingToken else {
            return nil
        }
        let createResult = try await Api.swapCexCreateTransaction(accountId: AccountStore.accountId!, password: passcode, params: params)
        if shouldTransfer {
            
            let amountValue = createResult.swap.fromAmount.value
            let amount: BigInt = doubleToBigInt(amountValue, decimals: sellingToken.decimals)
            
            let networkFeeValue = createResult.swap.networkFee?.value
            let networkFee = networkFeeValue.map { doubleToBigInt($0, decimals: sellingToken.decimals) }
            
            let toAddress = createResult.swap.cex?.payinAddress
            
            guard let toAddress else {
                return nil
            }
            let checkOptions = ApiCheckTransactionDraftOptions(
                accountId: AccountStore.accountId!,
                toAddress: toAddress,
                amount: amount,
                tokenAddress: sellingToken.tokenAddress,
                data: nil,
                stateInit: nil,
                shouldEncrypt: nil,
                isBase64Data: nil,
                forwardAmount: nil,
                allowGasless: false
            )
            let draft = try await Api.checkTransactionDraft(chain: sellingToken.chainValue, options: checkOptions)
            let options = ApiSubmitTransferOptions(
                accountId: AccountStore.accountId!,
                password: passcode,
                toAddress: draft.resolvedAddress ?? toAddress,
                amount: amount,
                comment: nil,
                tokenAddress: sellingToken.tokenAddress,
                fee: draft.fee,
                realFee: draft.realFee,
                shouldEncrypt: nil,
                isBase64Data: nil,
                withDiesel: false,
                dieselAmount: nil,
                stateInit: nil,
                isGaslessWithStars: nil,
                forwardAmount: nil,
                noFeeCheck: nil,
            )
            _ = try await Api.swapCexSubmit(chain: sellingToken.chainValue, options: options, swapId: createResult.swap.id)
            return nil
        } else {
            return createResult.activity
        }
    }
}
