//
//  TokenStore.swift
//  MyTonWalletAir
//
//  Created by Sina on 10/30/24.
//

import Foundation
import WalletContext

public var TokenStore: _TokenStore { _TokenStore.shared }
private let HISTORY_DATA_STALENESS = 120.0
private let log = Log("TokenStore")

public class _TokenStore {

    public static let shared = _TokenStore()
    
    private let _baseCurrency: UnfairLock<MBaseCurrency?> = .init(initialState: nil)
    private let _tokens: UnfairLock<[String: ApiToken]> = .init(initialState: _TokenStore.defaultTokens)
    private let _swapAssets: UnfairLock<[ApiToken]?> = .init(initialState: nil)
    private let _swapPairs: UnfairLock<[String: [MPair]]> = .init(initialState: [:])
    private let _currencyRates: UnfairLock<[String: MDouble]> = .init(initialState: [:])

    private let sharedCache = SharedCache()

    private var updateTokensTask: Task<Void, Never>?
    
    private init() {}

    public private(set) var baseCurrency: MBaseCurrency? {
        get { _baseCurrency.withLock { $0 } }
        set { _baseCurrency.withLock { $0 = newValue } }
    }
    
    public private(set) var currencyRates: [String: MDouble] {
        get { _currencyRates.withLock { $0 } }
        set { _currencyRates.withLock { $0 = newValue } }
    }
    
    public private(set) var tokens: [String: ApiToken] {
        get { _tokens.withLock { $0 } }
        set { _tokens.withLock { $0 = newValue } }
    }

    public private(set) var swapAssets: [ApiToken]? {
        get { _swapAssets.withLock { $0 } }
        set { _swapAssets.withLock { $0 = newValue } }
    }

    public var swapPairs: [String: [MPair]] {
        get { _swapPairs.withLock { $0 } }
        set { _swapPairs.withLock { $0 = newValue } }
    }
    
    public func chainForTokenSlug(_ tokenSlug: String?) -> ApiChain? {
        if let tokenSlug, let token = tokens[tokenSlug] {
            return ApiChain(rawValue: token.chain)
        }
        return nil
    }
    
    public var baseCurrencyRate: Double {
        let bc = self.baseCurrency ?? .USD
        return currencyRates[bc.rawValue]?.value ?? 1.0
    }
    
    private func loadTokensFromCache() {
        self.baseCurrency = AppStorageHelper.tokensCurrency() ?? .USD
        if let ratesDict = AppStorageHelper.currencyRatesDict() {
            self.currencyRates = ratesDict
        }
        if var tokensDict = AppStorageHelper.tokensDict() {
            self.baseCurrency = baseCurrency
            tokensDict.merge(Self.defaultTokens) { old, _ in old }
            self.tokens = tokensDict
            WalletCoreData.notify(event: .tokensChanged)
        } else {
            self.tokens = Self.defaultTokens
            // do not notify
        }
        scheduleSharedCacheUpdate(tokens: self.tokens, baseCurrency: self.baseCurrency, rates: self.currencyRates)
    }
    
    private func loadSwapAssetsFromCache() {
        guard let swapAssetsArray = AppStorageHelper.swapAssetsArray() else {
            return
        }
        process(swapAssetsArray: swapAssetsArray)
    }
    
    public func loadFromCache() {
        loadTokensFromCache()
        loadSwapAssetsFromCache()
        WalletCoreData.add(eventObserver: self)
    }
    
    public func getToken(slug: String) -> ApiToken? {
        return tokens[slug] ?? TokenStore.swapAssets?.first(where: { swapAsset in
            swapAsset.slug == slug
        })
    }
    
    public func getToken(slugOrAddress: String) -> ApiToken? {
        return tokens[slugOrAddress] ?? TokenStore.swapAssets?.first(where: { swapAsset in
            swapAsset.slug == slugOrAddress || swapAsset.tokenAddress == slugOrAddress
        })
    }
    
    private func process(newTokens: [String: ApiToken]) {
        assert(!Thread.isMainThread)
        var tokens = self.tokens
        for (slug, newToken) in newTokens {
            tokens[slug] = _merge(cached: self.tokens[slug], incoming: newToken)
        }
        _applyFixups(tokens: &tokens)
        self.tokens = tokens
        WalletCoreData.notify(event: .tokensChanged)
        if let baseCurrency = self.baseCurrency, tokens.count > 0 {
            DispatchQueue.global(qos: .background).async {
                AppStorageHelper.save(baseCurrency: baseCurrency, tokens: tokens, currencyRates: self.currencyRates)
            }
        }
        scheduleSharedCacheUpdate(tokens: tokens, baseCurrency: self.baseCurrency, rates: self.currencyRates)
    }
    
    private func _merge(cached: ApiToken?, incoming: ApiToken) -> ApiToken {
        guard let cached else { return incoming }
        
        let priceIsInvalid: Bool = (incoming.priceUsd == 0 && !PRICELESS_TOKEN_HASHES.contains(incoming.codeHash) && !STAKED_TOKEN_SLUGS.contains(incoming.slug))
            || (incoming.slug == TONCOIN_SLUG && incoming.priceUsd == 1.95)

        let merged = ApiToken(
            slug: incoming.slug.nilIfEmpty ?? cached.slug,
            name: incoming.name.nilIfEmpty ?? cached.name,
            symbol: incoming.symbol.nilIfEmpty ?? cached.symbol,
            decimals: incoming.decimals.nilIfZero ?? cached.decimals,
            chain: incoming.chain.nilIfEmpty ?? cached.chain,
            tokenAddress: incoming.tokenAddress?.nilIfEmpty ?? cached.tokenAddress,
            image: incoming.image?.nilIfEmpty ?? cached.image,
            isPopular: incoming.isPopular ?? cached.isPopular,
            keywords: incoming.keywords?.nilIfEmpty ?? cached.keywords,
            cmcSlug: incoming.cmcSlug?.nilIfEmpty ?? cached.cmcSlug,
            color: incoming.color?.nilIfEmpty ?? cached.color,
            isGaslessEnabled: incoming.isGaslessEnabled ?? cached.isGaslessEnabled,
            isStarsEnabled: incoming.isStarsEnabled ?? cached.isStarsEnabled,
            isTiny: incoming.isTiny ?? cached.isTiny,
            customPayloadApiUrl: incoming.customPayloadApiUrl?.nilIfEmpty ?? cached.customPayloadApiUrl,
            codeHash: incoming.codeHash?.nilIfEmpty ?? cached.codeHash,
            isFromBackend: incoming.isFromBackend ?? cached.isFromBackend,
            priceUsd: priceIsInvalid ? cached.priceUsd : incoming.priceUsd,
            percentChange24h: priceIsInvalid ? cached.percentChange24h : incoming.percentChange24h
        )
        return merged
    }
    
    private func _applyFixups(tokens: inout [String: ApiToken]) {
        // Set potentially missing images
        if tokens[STAKED_MYCOIN_SLUG]?.image?.nilIfEmpty == nil {
            let image = tokens[MYCOIN_SLUG]!.image
            tokens[STAKED_MYCOIN_SLUG]?.image = image
        }
        if tokens[TRON_USDT_SLUG]?.image?.nilIfEmpty == nil {
            let image = tokens[TON_USDT_SLUG]!.image
            tokens[TRON_USDT_SLUG]?.image = image
        }
    }
    
    // MARK: Base currency
    
    public func setBaseCurrency(currency: MBaseCurrency) async throws {
        await MainActor.run {
            AppStorageHelper.save(selectedCurrency: currency.rawValue)
        }
        self.baseCurrency = currency
        AppStorageHelper.save(baseCurrency: currency, tokens: tokens, currencyRates: self.currencyRates)
        WalletCoreData.notify(event: .baseCurrencyChanged(to: currency), for: nil)
        scheduleSharedCacheUpdate(tokens: self.tokens, baseCurrency: currency, rates: self.currencyRates)
    }
    
    public func getCurrencyRate(_ currency: MBaseCurrency) -> Double {
        _currencyRates.withLock { $0[currency.rawValue]?.value } ?? currency.fallbackExchangeRate
    }
    
    // MARK: - Swap assets
    
    private func process(swapAssetsArray: [[String: Any]]) {
        do {
            let assets = try JSONSerialization.decode([ApiToken].self, from: swapAssetsArray)
            TokenStore.swapAssets = assets.sorted { $0.name < $1.name }
            DispatchQueue.main.async {
                WalletCoreData.notify(event: .swapTokensChanged, for: nil)
            }
        } catch {
            log.error("failed to decode swap assets")
        }
    }
    
    public func updateSwapAssets() async throws -> [ApiToken] {
        let assets = try await Api.swapGetAssets()
        AppStorageHelper.save(swapAssetsArray: assets)
        return assets
    }
    
    // MARK: -
    
    public func clean() {
        self.baseCurrency = nil
        self.tokens = Self.defaultTokens
        self.swapAssets = nil
        self.swapPairs = [:]
    }
    
    internal static let defaultTokens: [String: ApiToken] = [
        TONCOIN_SLUG: .TONCOIN,
        TRX_SLUG: .TRX,
        MYCOIN_SLUG: .MYCOIN,
        TON_USDE_SLUG: .TON_USDE,
        STAKED_TON_SLUG: .STAKED_TON,
        STAKED_MYCOIN_SLUG: .STAKED_MYCOIN,
        TON_TSUSDE_SLUG: .TON_TSUSDE,
        TON_USDT_SLUG: .TON_USDT,
        TRON_USDT_SLUG: .TRON_USDT,
    ]
    
    
    // MARK: - Cached history data
    
    public struct HistoryData: Equatable, Hashable, Codable, Sendable {
        public var lastUpdated: Date
        public var data: [ApiPriceHistoryPeriod : [[Double]]?]
    }
    
    private var _historyData: UnfairLock<[String: HistoryData]> = .init(initialState: [:])
    public func historyData(tokenSlug: String) -> HistoryData? {
        if let data = _historyData.withLock({ $0[tokenSlug] }), abs(data.lastUpdated.timeIntervalSinceNow) < HISTORY_DATA_STALENESS {
            return data
        }
        return nil
    }
    public func setHistoryData(tokenSlug: String, data: [ApiPriceHistoryPeriod : [[Double]]?]) {
        let historyData = HistoryData(lastUpdated: .now, data: data)
        _historyData.withLock {
            $0[tokenSlug] = historyData
        }
    }
    private func clearHistoryData() {
        _historyData.withLock { $0 = [:] }
    }

    // MARK: - Shared Cache

    private func scheduleSharedCacheUpdate(tokens: [String: ApiToken]? = nil, baseCurrency: MBaseCurrency? = nil, rates: [String: MDouble]? = nil) {
        guard tokens != nil || baseCurrency != nil || rates != nil else { return }
        Task.detached(priority: .background) { [sharedCache] in
            await sharedCache.update(tokens: tokens, baseCurrency: baseCurrency, rates: rates)
        }
    }
}


extension _TokenStore: WalletCoreData.EventsObserver {
    
    public func walletCore(event: WalletCoreData.Event) {
        switch event {
        case .updateCurrencyRates(let update):
            let oldBaseCurrencyRate = self.baseCurrencyRate
            self.currencyRates = update.rates
            if self.baseCurrencyRate != oldBaseCurrencyRate {
                WalletCoreData.notify(event: .tokensChanged)
            }
            scheduleSharedCacheUpdate(rates: update.rates)

        case .updateTokens(let dict):
            self.updateTokensTask?.cancel()
            self.updateTokensTask = Task.detached {
                do {
                    // debounce
                    try await Task.sleep(for: .seconds(0.2))
                    try Task.checkCancellation()
                    
                    do {
                        let _tokens = try (dict["tokens"] as? [String: Any]).orThrow().mapValues { try ApiToken(any: $0) }
                        let update = ApiUpdate.UpdateTokens(
                            tokens: _tokens,
                        )
                        self.process(newTokens: update.tokens)

                    } catch {
                        log.fault("failed to decode updateTokens \(error, .public)")
                    }

                } catch {
                    log.info("<updateTokens> canceled")
                }
            }
        
        case .baseCurrencyChanged(to: let currency):
            if self.baseCurrency != currency {
                self.baseCurrency = currency
                clearHistoryData()
                WalletCoreData.notify(event: .tokensChanged)
                scheduleSharedCacheUpdate(tokens: self.tokens, baseCurrency: currency, rates: self.currencyRates)
            }

        case .updateSwapTokens(let update):
            Task.detached(priority: .background) {
                let tokens: [ApiToken] = update.tokens.values.sorted { $0.name < $1.name }
                AppStorageHelper.save(swapAssetsArray: tokens)
                TokenStore.swapAssets = tokens
                WalletCoreData.notify(event: .swapTokensChanged, for: nil)
            }
        default:
            break
        }
    }
}



extension AppStorageHelper {
    // MARK: - Tokens dict
    private static var tokensCurrencyKey = "cache.tokens.currency"
    private static var tokensKey = "cache.tokens"
    private static var currencyRatesKey = "cache.currencyRates"
    
    fileprivate static func save(baseCurrency: MBaseCurrency, tokens: [String: ApiToken], currencyRates: [String: MDouble]) {
        UserDefaults.standard.set(baseCurrency.rawValue, forKey: tokensCurrencyKey)
        if let data = try? JSONEncoder().encode(tokens) {
            UserDefaults.standard.set(data, forKey: AppStorageHelper.tokensKey)
        }
        if let data = try? JSONEncoder().encode(currencyRates) {
            UserDefaults.standard.set(data, forKey: AppStorageHelper.currencyRatesKey)
        }
    }
    
    fileprivate static func tokensCurrency() -> MBaseCurrency? {
        if let data = UserDefaults.standard.string(forKey: tokensCurrencyKey) {
            return MBaseCurrency(rawValue: data)
        }
        return nil
    }
    
    fileprivate static func tokensDict() -> [String: ApiToken]? {
        if let data = UserDefaults.standard.data(forKey: AppStorageHelper.tokensKey),
           let tokens = try? JSONDecoder().decode([String:ApiToken].self, from: data) {
            return tokens
        }
        return nil
    }
    
    fileprivate static func currencyRatesDict() -> [String: MDouble]? {
        if let data = UserDefaults.standard.data(forKey: AppStorageHelper.currencyRatesKey),
           let currencyRates = try? JSONDecoder().decode([String: MDouble].self, from: data) {
            return currencyRates
        }
        return nil
    }
    
    // MARK: - SwapAssets dict
    private static var swapAssetsArrayKey = "cache.swapAssets"
    public static func save(swapAssetsArray: [ApiToken]) {
        if let data = try? JSONSerialization.encode(swapAssetsArray) {
            UserDefaults.standard.set(data, forKey: AppStorageHelper.swapAssetsArrayKey)
        }
    }
    public static func swapAssetsArray() -> [[String: Any]]? {
        return UserDefaults.standard.value(forKey: AppStorageHelper.swapAssetsArrayKey) as? [[String: Any]]
    }
}

public extension ApiToken {
    static var toncoin: ApiToken { TokenStore.tokens[TONCOIN_SLUG]! }
    static var trx: ApiToken { TokenStore.tokens[TRX_SLUG]! }
    static var mycoin: ApiToken { TokenStore.tokens[MYCOIN_SLUG]! }
    static var usde: ApiToken { TokenStore.tokens[TON_USDE_SLUG]! }
    static var stakedTon: ApiToken { TokenStore.tokens[STAKED_TON_SLUG]! }
    static var stakedMycoin: ApiToken { TokenStore.tokens[STAKED_MYCOIN_SLUG]! }
    static var tsUsde: ApiToken { TokenStore.tokens[TON_TSUSDE_SLUG]! }
    static var tonUsdt: ApiToken { TokenStore.tokens[TON_USDT_SLUG]! }
    static var tronUsdt: ApiToken { TokenStore.tokens[TRON_USDT_SLUG]! }
}
