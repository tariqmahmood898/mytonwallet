//
//  WalletAssetsView.swift
//  MyTonWalletAir
//
//  Created by Sina on 11/15/24.
//

import UIKit
import SwiftUI
import UIComponents
import WalletContext
import WalletCore

class WalletAssetsView: WTouchPassView, WThemedView {
    
    var bottomConstraint: NSLayoutConstraint!
    
    let walletTokensView: WalletTokensView
    let walletCollectiblesView: NftsVC
    
    lazy var contentVcs: [any WSegmentedControllerContent] = [
        walletTokensView,
        walletCollectiblesView
    ]
    lazy var contentItems: [SegmentedControlItem] = [
        .init(index: 0, id: "tokens", content: AnyView(Text(lang("Assets")))),
        .init(index: 1, id: "nfts", content: AnyView(Text(lang("Collectibles")))),
    ]
    
    var onScrollingOffsetChanged: ((CGFloat) -> Void)?
    var scrollProgress: CGFloat = 0
    
    init(walletTokensView: WalletTokensView, walletCollectiblesView: NftsVC, onScrollingOffsetChanged:  ((CGFloat) -> Void)?) {
        self.walletTokensView = walletTokensView
        self.walletCollectiblesView = walletCollectiblesView
        self.onScrollingOffsetChanged = onScrollingOffsetChanged
        super.init(frame: .zero)
        setupViews()
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    lazy var segmentedController = WSegmentedController(
        viewControllers: contentVcs,
        items: contentItems,
        goUnderNavBar: false,
        animationSpeed: .medium,
        constraintToTopSafeArea: false,
        delegate: self
    )

    private func setupViews() {
        translatesAutoresizingMaskIntoConstraints = false
        segmentedController.translatesAutoresizingMaskIntoConstraints = false
        segmentedController.blurView.isHidden = true
        segmentedController.separator.isHidden = true
        addSubview(segmentedController)
        bottomConstraint = segmentedController.bottomAnchor.constraint(equalTo: bottomAnchor)
        NSLayoutConstraint.activate([
            segmentedController.leftAnchor.constraint(equalTo: leftAnchor),
            segmentedController.rightAnchor.constraint(equalTo: rightAnchor),
            segmentedController.topAnchor.constraint(equalTo: topAnchor),
            bottomConstraint,
        ])
        segmentedController.delegate?.segmentedController(scrollOffsetChangedTo: 0)
        
        updateTheme()
    }
    
    func updateTheme() {
        backgroundColor = WTheme.accentButton.background
    }
        
    var selectedIndex: Int {
        get { segmentedController.selectedIndex ?? 0 }
        set {
            segmentedController.scrollView.contentOffset = CGPoint(x: CGFloat(newValue) * segmentedController.scrollView.frame.width, y: 0)
            segmentedController.updatePanGesture(index: newValue)
        }
    }

    public var panGestureEnabled: Bool {
        get { segmentedController.panGestureEnabled }
        set { segmentedController.panGestureEnabled = newValue }
    }
}

extension WalletAssetsView: WSegmentedController.Delegate {
    func segmentedController(scrollOffsetChangedTo progress: CGFloat) {
        self.scrollProgress = progress
        onScrollingOffsetChanged?(progress)
    }
    func segmentedControllerDidStartDragging() {
    }
    func segmentedControllerDidEndScrolling() {
    }
}
