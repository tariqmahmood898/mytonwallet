//
//  BigIntUtils.swift
//  MyTonWalletAir
//
//  Created by Sina on 1/5/25.
//

@_exported import BigIntLib

extension BigInt {

    public func doubleAbsRepresentation(decimals: Int?) -> Double {
        var str = "\(abs(self))"
        while str.count < (decimals ?? 9) + 1 {
            str.insert("0", at: str.startIndex)
        }
        str.insert(contentsOf: ".", at: str.index(str.endIndex, offsetBy: -(decimals ?? 9)))
        return Double(str)!
    }

    public init?(bigint: String) {
        if bigint == "" {
            self = 0
        } else if let string = bigint.split(separator: ":").last, let value = BigInt(string) {
            self = value
        } else {
            return nil
        }
    }
}
