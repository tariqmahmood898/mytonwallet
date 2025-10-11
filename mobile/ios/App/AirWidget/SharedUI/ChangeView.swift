//
//  ChangeView.swift
//  App
//
//  Created by nikstar on 24.09.2025.
//

import SwiftUI
import WalletContext
import WalletCore

struct ChangeView: View {
    
    var changePercent: Double?
    var changeInCurrency: DisplayCurrencyAmount?
    var useColors: Bool
    
    var body: some View {
        if let change = changePercent, let changeInCurrency = changeInCurrency {
            let percent = "\(formatAmountText(amount: change, negativeSign: false, positiveSign: true, decimalsCount: 2))%"
            let curr = changeInCurrency.formatted(maxDecimals: changeInCurrency.adaptiveDecimals(), showPlus: false, showMinus: false)
            ViewThatFits(in: .horizontal) {
                Text("\(percent) · \(curr)")
                    .fixedSize()
                Text("\(percent)")
                    .fixedSize()
            }
            .foregroundStyle(useColors ? color : .white.opacity(0.75))
        }
    }
    
    var color: Color {
        let change = changePercent ?? 0
        if abs(change) <= 0.2 {
            return .secondary
        } else if change > 0 {
            return .green
        } else {
            return .red
        }
    }
}

