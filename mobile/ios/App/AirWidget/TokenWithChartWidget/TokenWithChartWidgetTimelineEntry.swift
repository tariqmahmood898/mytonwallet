//
//  TokenWidgetTimelineEntry.swift
//  App
//
//  Created by nikstar on 23.09.2025.
//

import SwiftUI
import WalletCore
import WidgetKit

public struct TokenWithChartWidgetTimelineEntry: TimelineEntry {
    public var date: Date
    public var token: ApiToken
    public var image: UIImage?
    public var currencyRate: DisplayCurrencyAmount
    public var period: PricePeriod
    public var chartData: [(Double, Double)]
    public var chartStyle: ChartStyle
    
    var changePercent: Double? {
        if let first = chartData.first?.1, let last = chartData.last?.1 {
            if last != 0 && first == 0 { return .infinity }
            if last == 0 && first == 0 { return 0 }
            return (last - first) / first * 100
        }
        return nil
    }
    
    var changeInCurrency: DisplayCurrencyAmount? {
        if let first = chartData.first?.1, let last = chartData.last?.1 {
            return DisplayCurrencyAmount.fromDouble(last - first, currencyRate.displayCurrency)
        }
        return nil
    }
    
    var firstDate: Date? {
        if let ts = chartData.first?.0 {
            return Date(timeIntervalSince1970: ts)
        }
        return nil
    }
    
    var firstValue: DisplayCurrencyAmount? {
        if let value = chartData.first?.1 {
            return DisplayCurrencyAmount.fromDouble(value, currencyRate.displayCurrency)
        }
        return nil
    }
    
    var lastDate: Date? {
        if let ts = chartData.last?.0 {
            return Date(timeIntervalSince1970: ts)
        }
        return nil
    }
}

public extension TokenWithChartWidgetTimelineEntry {
    static var placeholder: TokenWithChartWidgetTimelineEntry {
        var token = ApiToken.TONCOIN
        token.percentChange24h = 3.41
        return TokenWithChartWidgetTimelineEntry(
            date: .now,
            token: token,
            image: nil, 
            currencyRate: DisplayCurrencyAmount.fromDouble(4.21, .USD),
            period: .month,
            chartData: [],
            chartStyle: .vivid,
        )
    }
}   
