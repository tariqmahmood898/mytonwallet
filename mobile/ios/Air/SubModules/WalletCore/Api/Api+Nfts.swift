
import Foundation
import WebKit
import WalletContext

extension Api {
    
    public static func fetchNftsFromCollection(accountId: String, collectionAddress: String) async throws {
        try await bridge.callApiVoid("fetchNftsFromCollection", accountId, collectionAddress)
    }
    
    public static func checkNftTransferDraft(options: ApiCheckNftTransferDraftOptions) async throws -> MTransactionDraft {
        try await bridge.callApi("checkNftTransferDraft", options, decoding: MTransactionDraft.self)
    }

    public static func submitNftTransfers(accountId: String, password: String?, nfts: [ApiNft], toAddress: String, comment: String?, totalRealFee: BigInt?) async throws -> ApiSubmitNftTransfersResult {
        try await bridge.callApi("submitNftTransfers", accountId, password, nfts, toAddress, comment, totalRealFee, decoding: ApiSubmitNftTransfersResult.self)
    }
    
    public static func checkNftOwnership(accountId: String, nftAddress: String) async throws -> Bool? {
        try await bridge.callApiOptional("checkNftOwnership", accountId, nftAddress, decodingOptional: Bool.self)
    }
}


// MARK: - Types

public struct ApiCheckNftTransferDraftOptions: Encodable {
    public let accountId: String
    public let nfts: [ApiNft]
    public let toAddress: String
    public let comment: String?
    
    public init(accountId: String, nfts: [ApiNft], toAddress: String, comment: String?) {
        self.accountId = accountId
        self.nfts = nfts
        self.toAddress = toAddress
        self.comment = comment
    }
}

public struct ApiSubmitNftTransfersResult: Decodable, Sendable {
    // ApiSubmitMultiTransferResult
    public let messages: [TonTransferParams]
    public let amount: String
    public let seqno: Int
    public let boc: String
    public let msgHash: String
    public let msgHashNormalized: String
    public let paymentLink: String?
    public let withW5Gasless: Bool?

    public let activityIds: [String]
}

public struct TonTransferParams: Equatable, Hashable, Codable, Sendable {
    public var toAddress: String
    public var amount: BigInt
    public var isBase64Payload: Bool?
    // Not implemented:
    //    public var payload: AnyPayload?
    //    public var stateInit: Cell?
    //    public var hints: TonTransferHints?
}
