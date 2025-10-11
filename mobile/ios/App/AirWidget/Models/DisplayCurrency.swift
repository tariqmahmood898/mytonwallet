//
//  PeriodQuery.swift
//  App
//
//  Created by nikstar on 24.09.2025.
//

import Foundation
import WalletContext
import WalletCore

public enum DisplayCurrency: String, Equatable, Hashable, Codable, Sendable, Identifiable, CaseIterable {
    case USD = "USD"
    case EUR = "EUR"
    case RUB = "RUB"
    case CNY = "CNY"
    case BTC = "BTC"
    case TON = "TON"
    
    public var sign: String {
        switch self {
        case .USD:
            return "$"
        case .EUR:
            return "€"
        case .RUB:
            return "₽"
        case .CNY:
            return "¥"
        case .BTC:
            return "BTC"
        case .TON:
            return "TON"
        }
    }
    
    public var decimalsCount: Int {
        switch self {
        case .BTC:
            8
        default:
            6
        }
    }
    
    public var symbol: String {
        return rawValue
    }

    public var name: LocalizedStringResource {
        switch self {
        case .USD:
            return LocalizedStringResource("US Dollar", bundle: LocalizationSupport.shared.bundle)
        case .EUR:
            return LocalizedStringResource("Euro", bundle: LocalizationSupport.shared.bundle)
        case .RUB:
            return LocalizedStringResource("Russian Ruble", bundle: LocalizationSupport.shared.bundle)
        case .CNY:
            return LocalizedStringResource("Chinese Yuan", bundle: LocalizationSupport.shared.bundle)
        case .BTC:
            return LocalizedStringResource("Bitcoin", bundle: LocalizationSupport.shared.bundle)
        case .TON:
            return LocalizedStringResource("Toncoin", bundle: LocalizationSupport.shared.bundle)
        }
    }
    
    public var id: Self { self }
}


extension DisplayCurrency: DecimalBackingType {
    public var decimals: Int { decimalsCount }
    public var displaySymbol: String? { sign }
    public var forceCurrencyToRight: Bool { sign == "₽" }
}

extension DecimalAmount where Backing == DisplayCurrency {
    public var displayCurrency: DisplayCurrency { type }
    
    func adaptiveDecimals() -> Int {
        let v = abs(doubleValue)
        let resolved = if v < 0.00_00_05 {
            min(decimals, 8)
        } else if v < 0.00_05 {
            min(decimals, 6)
        } else if v < 0.05 {
            min(decimals, 4)
        } else if v < 10_000 {
            min(decimals, 2)
        } else {
            0
        }
        return resolved
    }
}

public typealias DisplayCurrencyAmount = DecimalAmount<DisplayCurrency>


