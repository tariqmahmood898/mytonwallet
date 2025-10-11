//
//  AccountTypePickerVC.swift
//  AirAsFramework
//
//  Created by nikstar on 25.08.2025.
//

import UIKit
import SwiftUI
import WalletContext
import WalletCore
import UIComponents

public final class AccountTypePickerVC: WViewController {
    
    var showCreateWallet: Bool
    var showSwitchToOtherVersion: Bool
    
    var hostingController: UIHostingController<AccountTypePickerView>?
    private let navHeight: CGFloat = 60

    public init(showCreateWallet: Bool, showSwitchToOtherVersion: Bool) {
        self.showCreateWallet = showCreateWallet
        self.showSwitchToOtherVersion = showSwitchToOtherVersion
        super.init(nibName: nil, bundle: nil)
    }
    
    @MainActor required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    public override func viewDidLoad() {
        super.viewDidLoad()
        
        addNavigationBar(
            navHeight: navHeight,
            title: showCreateWallet ? lang("Add Wallet") : lang("Import Wallet"),
            closeIcon: true,
        )
        
        hostingController = addHostingController(makeView(), constraints: .fillWithNavigationBar)
        
        updateTheme()
    }
    
    func makeView() -> AccountTypePickerView {
        AccountTypePickerView(
            showCreateWallet: showCreateWallet,
            showSwitchToOtherVersionIfAvailable: showSwitchToOtherVersion,
            onHeightChange: { [weak self] height in self?.onHeightChange(height) }
        )
    }
    
    public override func updateTheme() {
        super.updateTheme()
        view.backgroundColor = WTheme.sheetBackground
    }
    
    func onHeightChange(_ height: CGFloat) {
        if let sheet = sheetPresentationController {
            sheet.detents = [.custom(identifier: .content, resolver: { [navHeight] _ in height + navHeight })]
        }
    }
}

private extension UISheetPresentationController.Detent.Identifier {
    static let content = UISheetPresentationController.Detent.Identifier("content")
}

#if DEBUG
@available(iOS 18, *)
#Preview {
    AccountTypePickerVC(
        showCreateWallet: true,
        showSwitchToOtherVersion: true
    )
}
#endif
