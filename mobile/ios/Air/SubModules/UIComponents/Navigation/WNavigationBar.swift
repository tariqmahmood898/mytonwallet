//
//  WNavigationBar.swift
//  UIComponents
//
//  Created by Sina on 4/29/23.
//

import UIKit
import WalletContext

public class WNavigationBarButton {
    
    public let view: UIView
    let onPress: (() -> Void)?

    public init(text: String? = nil, icon: UIImage? = nil, tintColor: UIColor? = nil, onPress: (() -> Void)? = nil, menu: UIMenu? = nil, showsMenuAsPrimaryAction: Bool = false) {
        let btn = {
            let btn = WButton(style: .clearBackground)
            if let icon {
                btn.setImage(icon, for: .normal)
                if let tintColor {
                    btn.imageView?.tintColor = tintColor // sometimes it didn't work without this line
                }
                btn.centerTextAndImage(spacing: 8)
            }
            btn.setTitle(text, for: .normal)
            btn.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
            btn.translatesAutoresizingMaskIntoConstraints = false
            return btn
        }()
        if let menu {
            btn.menu = menu
            btn.showsMenuAsPrimaryAction = showsMenuAsPrimaryAction
        }
        self.view = btn
        self.onPress = onPress

        if !showsMenuAsPrimaryAction {
            btn.addTarget(self, action: #selector(itemPressed), for: .touchUpInside)
        }
    }
    
    public init(view: UIView, onPress: (() -> Void)? = nil) {
        self.view = view
        self.onPress = onPress
        view.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(itemPressed)))
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    @objc private func itemPressed() {
        onPress?()
    }
}

public class WNavigationBar: WTouchPassView, WThemedView {

    private var _shouldPassTouches: Bool = false
    public override var shouldPassTouches: Bool {
        get {
            return _shouldPassTouches
        }
        set {
            _shouldPassTouches = newValue
        }
    }
    
    public var navHeight: CGFloat
    public let topOffset: CGFloat
    public let centerYOffset: CGFloat
    public let blurView = WBlurView()
    public var blurViewBottomConstraint: NSLayoutConstraint!
    public let separatorView: UIView = UIView()
    public var contentView: UIView!
    public let titleStackView = UIStackView()
    public var titleStackViewCenterYAnchor: NSLayoutConstraint!
    public var titleLabel: UILabel? = nil
    public var subtitleLabel: UILabel? = nil
    
    private let title: String?
    private let subtitle: String?
    public let leadingItem: WNavigationBarButton?
    public let trailingItem: WNavigationBarButton?
    private let titleColor: UIColor?
    private let closeIcon: Bool
    private let closeIconColor: UIColor?
    private let closeIconFillColor: UIColor?
    private(set) public var backButton: UIButton? = nil
    private let onBackPressed: (() -> Void)?
    
    public init(navHeight: CGFloat = 56,
                topOffset: CGFloat = 0,
                centerYOffset: CGFloat = 0,
                title: String? = nil,
                subtitle: String? = nil,
                leadingItem: WNavigationBarButton? = nil,
                trailingItem: WNavigationBarButton? = nil,
                tintColor: UIColor? = nil,
                titleColor: UIColor? = nil,
                closeIcon: Bool = false,
                closeIconColor: UIColor? = nil,
                closeIconFillColor: UIColor? = nil,
                addBackButton: (() -> Void)? = nil) {
        self.navHeight = navHeight
        self.topOffset = topOffset
        self.centerYOffset = centerYOffset
        self.title = title
        self.subtitle = subtitle
        self.leadingItem = leadingItem
        self.trailingItem = trailingItem
        self.titleColor = titleColor
        self.closeIcon = closeIcon
        self.closeIconColor = closeIconColor
        self.closeIconFillColor = closeIconFillColor
        self.onBackPressed = addBackButton
        super.init(frame: .zero)
        if let tintColor {
            self.tintColor = tintColor
        }
        setupViews()
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setupViews() {
        translatesAutoresizingMaskIntoConstraints = false

        backgroundColor = .clear
        blurView.alpha = 0
        addSubview(blurView)
        blurViewBottomConstraint = blurView.bottomAnchor.constraint(equalTo: bottomAnchor)

        NSLayoutConstraint.activate([
            blurView.leftAnchor.constraint(equalTo: leftAnchor),
            blurView.topAnchor.constraint(equalTo: topAnchor),
            blurView.rightAnchor.constraint(equalTo: rightAnchor),
            blurViewBottomConstraint
        ])
        
        separatorView.translatesAutoresizingMaskIntoConstraints = false
        separatorView.translatesAutoresizingMaskIntoConstraints = false
        separatorView.backgroundColor = WTheme.separator
        separatorView.alpha = 0
        addSubview(separatorView)
        NSLayoutConstraint.activate([
            separatorView.bottomAnchor.constraint(equalTo: bottomAnchor),
            separatorView.leftAnchor.constraint(equalTo: leftAnchor),
            separatorView.rightAnchor.constraint(equalTo: rightAnchor),
            separatorView.heightAnchor.constraint(equalToConstant: 0.33),
        ])

        contentView = WTouchPassView()
        contentView.translatesAutoresizingMaskIntoConstraints = false
        contentView.backgroundColor = .clear
        addSubview(contentView)
        NSLayoutConstraint.activate([
            contentView.leftAnchor.constraint(equalTo: leftAnchor),
            contentView.rightAnchor.constraint(equalTo: rightAnchor),
            contentView.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor, constant: topOffset),
            contentView.bottomAnchor.constraint(equalTo: bottomAnchor).withPriority(.init(999)),
            contentView.heightAnchor.constraint(equalToConstant: navHeight - topOffset)
        ])

        titleStackView.translatesAutoresizingMaskIntoConstraints = false
        titleStackView.axis = .vertical
        titleStackView.alignment = .center
        titleStackView.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        if navHeight >= 60 {
            titleStackView.spacing = 2
        }
        
        if let title {
            titleLabel = UILabel()
            titleLabel?.text = title
            titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
            if let titleColor {
                titleLabel?.textColor = titleColor
            }
            titleStackView.addArrangedSubview(titleLabel!)
        }

        if let subtitle {
            let subtitleLabel = UILabel()
            self.subtitleLabel = subtitleLabel
            subtitleLabel.text = subtitle
            subtitleLabel.textColor = WTheme.secondaryLabel
            subtitleLabel.font = .systemFont(ofSize: 13, weight: .regular)
            titleStackView.addArrangedSubview(subtitleLabel)
        }

        contentView.addSubview(titleStackView)
        
        titleStackViewCenterYAnchor = titleStackView.centerYAnchor.constraint(equalTo: contentView.centerYAnchor, constant: centerYOffset)
        NSLayoutConstraint.activate([
            titleStackView.centerXAnchor.constraint(equalTo: centerXAnchor),
            titleStackViewCenterYAnchor
        ])

        if let leadingItem {
            contentView.addSubview(leadingItem.view)
            NSLayoutConstraint.activate([
                leadingItem.view.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
                leadingItem.view.centerYAnchor.constraint(equalTo: contentView.centerYAnchor)
            ])
        }

        if let trailingItem {
            contentView.addSubview(trailingItem.view)
            NSLayoutConstraint.activate([
                trailingItem.view.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
                trailingItem.view.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
                trailingItem.view.leadingAnchor.constraint(greaterThanOrEqualTo: titleStackView.trailingAnchor, constant: 4),
            ])
        }
        
        if closeIcon {
            let closeButton = UIButton(type: .system)
            closeButton.translatesAutoresizingMaskIntoConstraints = false
            closeButton.backgroundColor = closeIconFillColor ?? WTheme.secondaryLabel.withAlphaComponent(0.15)
            closeButton.layer.cornerRadius = 15
            closeButton.layer.masksToBounds = true
            contentView.addSubview(closeButton)
            NSLayoutConstraint.activate([
                closeButton.widthAnchor.constraint(equalToConstant: 30),
                closeButton.heightAnchor.constraint(equalToConstant: 30),
                closeButton.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
                closeButton.centerYAnchor.constraint(equalTo: contentView.centerYAnchor)
            ])
            closeButton.setImage(UIImage(named: "XMark", in: AirBundle, with: nil)!, for: .normal)
            closeButton.tintColor = closeIconColor ?? WTheme.secondaryLabel
            closeButton.addTarget(self, action: #selector(closeButtonPressed), for: .touchUpInside)
        }
        
        if onBackPressed != nil {
            let backButton = UIButton(type: .system)
            self.backButton = backButton
            backButton.setContentCompressionResistancePriority(.required, for: .horizontal)
            backButton.contentHorizontalAlignment = .leading
            backButton.addTarget(self, action: #selector(backButtonPressed), for: .touchUpInside)
            contentView.addSubview(backButton)
            NSLayoutConstraint.activate([
                backButton.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 7),
                backButton.topAnchor.constraint(equalTo: contentView.topAnchor),
                backButton.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),
                backButton.trailingAnchor.constraint(lessThanOrEqualTo: titleStackView.leadingAnchor, constant: -4),
            ])
        }
        
        updateTheme()
    }
    
    @objc func closeButtonPressed() {
        topViewController()?.dismiss(animated: true)
    }
    
    @objc func backButtonPressed() {
        onBackPressed?()
    }
    
    public func updateTheme() {
        if let backButton {
            backButton.translatesAutoresizingMaskIntoConstraints = false
            let backArrowImage = UIImage(systemName: "chevron.backward",
                                         withConfiguration: UIImage.SymbolConfiguration(pointSize: 23,
                                                                                        weight: .medium))
            let imageAttachment = NSTextAttachment()
            imageAttachment.image = backArrowImage?.withTintColor(WTheme.tint).withRenderingMode(.alwaysTemplate)
            let attributedString = NSMutableAttributedString()
            if imageAttachment.image != nil {
                let imageAttachmentString = NSAttributedString(attachment: imageAttachment)
                attributedString.append(imageAttachmentString)
            }
            let titleString = NSAttributedString(string: " \(lang("Back"))", attributes: [
                .foregroundColor: WTheme.tint,
                .font: UIFont.systemFont(ofSize: 17, weight: .regular),
                .baselineOffset: 2
            ])
            attributedString.append(titleString)
            backButton.setAttributedTitle(attributedString, for: .normal)
            backButton.tintColor = WTheme.tint
        }
    }
    
    public var showSeparator: Bool = false {
        didSet {
            if showSeparator, separatorView.alpha == 0 {
                UIView.animate(withDuration: 0.3) { [weak self] in
                    guard let self else {return}
                    separatorView.alpha = 1
                    blurView.alpha = 1
                }
            } else if !showSeparator, separatorView.alpha == 1 {
                UIView.animate(withDuration: 0.3) { [weak self] in
                    guard let self else {return}
                    separatorView.alpha = 0
                    blurView.alpha = 0
                }
            }
        }
    }
    
    var newTitle: String? = nil
    public func set(title: String?, animated: Bool = true, titleColor: UIColor? = nil) {
        guard let titleLabel, newTitle != title else {
            return
        }
        newTitle = title
        guard animated else {
            titleLabel.text = title
            return
        }
        func setNewTitle() {
            titleLabel.text = newTitle
            if let titleColor {
                titleLabel.textColor = titleColor
            }
            UIView.animate(withDuration: 0.1) { [weak self] in
                self?.titleLabel?.alpha = 1
            }
        }
        if titleLabel.alpha == 0 {
            setNewTitle()
        } else {
            UIView.animate(withDuration: 0.1) { [weak self] in
                self?.titleLabel?.alpha = 0
            } completion: { _ in
                setNewTitle()
            }
        }
    }
    
    public func addSearchBar(_ searchBar: UISearchBar) {
        addSubview(searchBar)
        searchBar.backgroundColor = .clear
        searchBar.isTranslucent = true
        searchBar.translatesAutoresizingMaskIntoConstraints = false
        navHeight += 52 - 5
        searchBar.searchBarStyle = .minimal
        NSLayoutConstraint.activate([
            searchBar.topAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -5), // TODO: do this properly
            searchBar.heightAnchor.constraint(equalToConstant: 52),
            searchBar.leadingAnchor.constraint(equalTo: leadingAnchor),
            searchBar.trailingAnchor.constraint(equalTo: trailingAnchor),
            searchBar.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }
}
