
import Foundation
import SwiftUI
import UIComponents
import WalletCore
import WalletContext

struct AddStakeView: View {
    
    @ObservedObject var model: AddStakeModel
    var navigationBarInset: CGFloat
    var onScrollPositionChange: (CGFloat) -> ()
    
    @Namespace private var ns
    
    var body: some View {
        InsetList {
            AmountSection(model: model)
                .background {
                    GeometryReader { geom in
                        Color.clear.onChange(of: geom.frame(in: .named(ns)).origin.y) { y in
                            onScrollPositionChange(y + 2)
                        }
                    }
                }

            StakeInfoSection(model: model)
                    .padding(.top, -8)
        }
        .padding(.top, -8)
        .coordinateSpace(name: ns)
        .navigationBarInset(navigationBarInset)
        .contentShape(.rect)
        .onTapGesture {
            model.onBackgroundTapped()
        }
        .onChange(of: model.amount) { amount in
            if let amount, model.switchedToBaseCurrencyInput == false {
                model.updateBaseCurrencyAmount(amount)
            }
        }
        .onChange(of: model.amountInBaseCurrency) { baseCurrencyAmount in
            if let baseCurrencyAmount, model.switchedToBaseCurrencyInput == true {
                model.updateAmountFromBaseCurrency(baseCurrencyAmount)
            }
        }
        .task(id: model.amount) {
            await model.updateFee()
        }
    }
}


fileprivate struct AmountSection: View {
    
    @ObservedObject var model: AddStakeModel
    
    var body: some View {
        TokenAmountEntrySection(
            amount: $model.amount,
            token: displayToken,
            balance: model.maxAmount,
            insufficientFunds: model.insufficientFunds,
            amountInBaseCurrency: $model.amountInBaseCurrency,
            switchedToBaseCurrencyInput: $model.switchedToBaseCurrencyInput,
            fee: model.fee,
            explainedFee: nil,
            isFocused: $model.isAmountFieldFocused,
            onTokenSelect: nil,
            onUseAll: { model.onUseAll() }
        )
    }
    
    /// even when withdrawing "staked", show normal token
    var displayToken: ApiToken {
        model.baseToken
    }
}


fileprivate struct StakeInfoSection: View {
    
    @ObservedObject var model: AddStakeModel
    
    var body: some View {
        InsetSection {
            InsetCell {
                HStack {
                    Text(lang("Current APY"))
                        .font17h22()
                    Spacer()
                    apyBadge
                }
                .padding(.top, -1)
                .padding(.bottom, -1)
            }
            InsetCell {
                HStack {
                    Text(lang("Est. earning per year"))
                        .font17h22()
                    Spacer()
                    estEarning
                }
                .padding(.top, -1)
            }
            InsetButtonCell(action: { model.onWhyIsSafe?() }) {
                Text(model.config.explainTitle)
                    .font17h22()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .tint(Color(WTheme.tint))
                    .padding(.top, -1)
            }
        } header: {
            Text(lang("Staking Details"))
        } footer: {}
    }
    
    @ViewBuilder
    var apyBadge: some View {
        let v = formatAmountText(amount: model.apy)
        Text("\(v)%")
            .fontWeight(.medium)
            .font(.callout)
            .lineSpacing(3)
            .padding(.top, 2.66)
            .padding(.bottom, 2.66)
            .padding(.horizontal, 6)
            .foregroundStyle(Color(WTheme.background))
            .background {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(earnGradient)
            }
    }
    
    @ViewBuilder
    var estEarning: some View {
        estEarningText
            .fontWeight(.medium)
            .font17h22()
            .foregroundStyle(earnGradient)
    }
    
    var estEarningText: Text {
        if model.switchedToBaseCurrencyInput {
            let cur = model.amountInBaseCurrency ?? 0
            let income = cur * BigInt(model.apy * 1000) / 1000 / 100
            return Text(amount: DecimalAmount.baseCurrency(income)!, format: .init(showPlus: true))
        } else {
            let amnt = (model.amount ?? 0)
            let income = amnt * BigInt(model.apy * 1000) / 1000 / 100
            return Text(amount: TokenAmount(income, model.baseToken), format: .init(showPlus: true))
        }
    }
}
