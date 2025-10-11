//
//  CrossChainToTonView.swift
//  UISwap
//
//  Created by Sina on 5/12/24.
//

import SwiftUI
import UIKit
import UIComponents
import WalletCore
import WalletContext
import SwiftSignalKit


struct CrossChainToTonView: View {
    
    private let sellingToken: ApiToken
    private let amount: Double
    private let address: String
    private let expireDate: Date
    private let exchangerTxId: String
    
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    @State private var remaining: String = ""
    
    init(sellingToken: ApiToken, amount: Double, address: String, dt: Date, exchangerTxId: String) {
        self.sellingToken = sellingToken
        self.amount = amount
        self.address = address
        self.expireDate = Date(timeIntervalSince1970: dt.timeIntervalSince1970 + 3 * 60 * 60)
        self.exchangerTxId = exchangerTxId
    }
    
    var body: some View {
        InsetSection {
            content
            
        } header: {
            header
        } footer: {
            footer
        }

    }
    
    var content: some View {
        VStack(spacing: 8) {
            amountView
                .padding(.top, 16)
            addressView
            qr
                .padding(.bottom, 16)
        }
        .padding(.horizontal, 16)
    }
    
    var amountView: some View {
        HStack(spacing: 2) {
            Image(systemName: "clock.fill")
                .imageScale(.small)
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(Color(WTheme.secondaryLabel))
            AmountText(
                amount: DecimalAmount.fromDouble(amount, sellingToken),
                format: .init(),
                integerFont: .systemFont(ofSize: 17, weight: .semibold),
                fractionFont: .systemFont(ofSize: 17, weight: .semibold),
                symbolFont: .systemFont(ofSize: 17, weight: .semibold),
                integerColor: WTheme.primaryLabel,
                fractionColor: WTheme.primaryLabel,
                symbolColor: WTheme.secondaryLabel
            )
        }
    }
    
    var qr: some View {
        WUIQRCodeContainerView(
            url: sellingToken.chain == "ton" ? ApiChain.ton.invoiceUrl(address: address) : address,
            imageURL: sellingToken.image ?? "",
            size: 262,
            onTap: onQRTap
        )
        .frame(width: 262, height: 262, alignment: .leading)
        .padding(.leading, 6)
        .padding(4)
    }
    
    @ViewBuilder
    var addressView: some View {
        let copy = Text(
            Image("HomeCopy", bundle: AirBundle)
        )
            .foregroundColor(Color(WTheme.secondaryLabel))

        let addressText = Text(address: address)
        let text = Text("\(addressText) \(copy)")
            .font(.system(size: 17, weight: .regular))
            .lineSpacing(2)
            .multilineTextAlignment(.center)
        
        Button(action: copyAddress) {
            text
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 8)
        
    }
    
    var header: some View {
        HStack {
            Text(WStrings.CrossChainSwap_SendToThisAddress_Text(symbol: sellingToken.symbol).uppercased())
            Spacer()
            Text(remaining)
        }
        .onReceive(timer) { _ in
            remaining = expireDate.remainingFromNow
        }
    }
    
    var footer: some View {
        VStack(alignment: .leading, spacing: 16) {
            disclaimer
                .padding(.top, 13)
            
            transactionID
        }
    }
    
    var disclaimer: some View {
        let text = lang("Please note that it may take up to a few hours for tokens to appear in your wallet.") + "\n\n" + lang("$swap_changelly_support", arg1: lang("Changelly Live Chat"), arg2: "support@changelly.org")
        let attr = NSMutableAttributedString(string: text,
                                             attributes: [
            .font: UIFont.systemFont(ofSize: 13),
            .foregroundColor: WTheme.secondaryLabel
        ])
        // Highlight specified terms
        let highlightLinks = ["https://support.changelly.com/support/home", "mailto:support@changelly.org"]
        for (i, highlight) in [lang("Changelly Live Chat"), "support@changelly.org"].enumerated() {
            let range = (attr.string as NSString).range(of: highlight)
            attr.addAttribute(.foregroundColor, value: WTheme.primaryButton.background, range: range)
            attr.addAttribute(.link, value: highlightLinks[i], range: range)
        }
        return Text(attr)
            .lineSpacing(3)
    }

    var transactionID: some View {
        Button(action: copyTx) {
            VStack(alignment: .leading, spacing: 2) {
                Text(lang("Transaction ID"))
                    .fontWeight(.semibold)
                HStack(spacing: 4) {
                    Text(verbatim: exchangerTxId)
                        .font(.system(size: 17, weight: .regular))
                    Image("HomeCopy", bundle: AirBundle)
                }
            }
            .foregroundStyle(Color(WTheme.secondaryLabel))
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }
    
    func copyAddress() {
        UIPasteboard.general.string = address
        topWViewController()?.showToast(message: lang("Transaction ID was copied!"))
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
    }
    
    func copyTx() {
        UIPasteboard.general.string = exchangerTxId
        topWViewController()?.showToast(message: lang("Transaction ID was copied!"))
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
    }
    
    func onQRTap() {
        if let image = sellingToken.image?.nilIfEmpty, let url = URL(string: image) {
            UIImage.downloadImage(url: url) { img in
                if let img {
                    shareIt(image: img)
                }
            }
        } else {
            shareIt(image: UIImage(named: "chain_ton", in: AirBundle, compatibleWith: nil) ?? UIImage())
        }
    }
    
    func shareIt(image: UIImage) {
        let _ = (qrCode(string: ApiChain.ton.invoiceUrl(address: address),
                        color: .black,
                        backgroundColor: .white,
                        icon: .custom(UIImage(named: "chain_ton", in: AirBundle, compatibleWith: nil)))
                 |> map { _, generator -> UIImage? in
            let imageSize = CGSize(width: 768.0, height: 768.0)
            let context = generator(TransformImageArguments(corners: ImageCorners(), imageSize: imageSize, boundingSize: imageSize, intrinsicInsets: UIEdgeInsets(), scale: 1.0))
            return context?.generateImage()
        }
                 |> deliverOnMainQueue).start(next: { image in
            guard let image = image else { return }
            
            let activityController = UIActivityViewController(activityItems: [image],
                                                              applicationActivities: nil)
            topViewController()?.present(activityController, animated: true)
        })
    }
}

    
