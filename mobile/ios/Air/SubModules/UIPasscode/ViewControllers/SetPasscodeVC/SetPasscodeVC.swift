//
//  SetPasscodeVC.swift
//  UIPasscode
//
//  Created by Sina on 4/16/23.
//

import UIKit
import UIComponents
import WalletContext

public class SetPasscodeVC: WViewController, PasscodeScreenViewDelegate {
    func animateSuccess() {
        
    }
    
    func onAuthenticated(taskDone: Bool, passcode: String) {
        
    }
    
    
    var onCompletion: (_ biometricsEnabled: Bool, _ passcode: String, _ onResult: @escaping () -> Void) -> Void

    public init(onCompletion: @escaping (Bool, String, @escaping () -> Void) -> Void) {
        self.onCompletion = onCompletion
        super.init(nibName: nil, bundle: nil)
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    var headerView: HeaderView!
    var passcodeOptionsButton: WButton!
    var passcodeInputView: PasscodeInputView!
    var passcodeScreenView: PasscodeScreenView!
    var passcodeOptionsView: PasscodeOptionsView!
    var bottomConstraint: NSLayoutConstraint!

    public static let passcodeOptionsFromBottom = CGFloat(8)
    
    public override func loadView() {
        super.loadView()
        setupViews()
    }
    
    func setupViews() {
        navigationItem.hidesBackButton = true

        // top animation and header
        let topView = UIView()
        topView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(topView)
        NSLayoutConstraint.activate([
            topView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            topView.leftAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leftAnchor),
            topView.rightAnchor.constraint(equalTo: view.safeAreaLayoutGuide.rightAnchor)
        ])

        headerView = HeaderView(
            animationName: "animation_guard",
            animationPlaybackMode: .once,
            title: lang("Wallet is ready!"),
            description: lang(
                "Create a code to protect it"
            )
        )
        topView.addSubview(headerView)
        NSLayoutConstraint.activate([
            headerView.topAnchor.constraint(equalTo: topView.topAnchor, constant: -10),
            headerView.centerXAnchor.constraint(equalTo: topView.centerXAnchor),
            headerView.bottomAnchor.constraint(equalTo: topView.bottomAnchor)
        ])

        // setup passcode input view
        passcodeInputView = PasscodeInputView(delegate: self, theme: WTheme.setPasscodeInput)
        passcodeInputView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(passcodeInputView)
        NSLayoutConstraint.activate([
            passcodeInputView.topAnchor.constraint(equalTo: topView.bottomAnchor, constant: 40),
            passcodeInputView.centerXAnchor.constraint(equalTo: view.centerXAnchor)
        ])
        passcodeInputView.isHidden = true
        
        // setup passcode options button
        passcodeOptionsButton = WButton(style: .clearBackground)
        passcodeOptionsButton.translatesAutoresizingMaskIntoConstraints = false
        passcodeOptionsButton.setTitle(lang("Use 6-digit Passcode"), for: .normal)
        passcodeOptionsButton.titleLabel?.font = UIFont.systemFont(ofSize: 17, weight: .semibold)
        passcodeOptionsButton.addTarget(self, action: #selector(passcodeOptionsPressed), for: .touchUpInside)
        view.addSubview(passcodeOptionsButton)
        bottomConstraint = passcodeOptionsButton.bottomAnchor.constraint(equalTo: view.bottomAnchor,
                                                                         constant: -SetPasscodeVC.passcodeOptionsFromBottom)
        NSLayoutConstraint.activate([
            bottomConstraint,
            passcodeOptionsButton.centerXAnchor.constraint(equalTo: view.centerXAnchor)
        ])
        // six-digit option is disabled
        passcodeOptionsButton.isHidden = true

        // listen for keyboard
        WKeyboardObserver.observeKeyboard(delegate: self)

        // passcode options view
        passcodeOptionsView = PasscodeOptionsView(delegate: self)
        view.addSubview(passcodeOptionsView)
        NSLayoutConstraint.activate([
            passcodeOptionsView.bottomAnchor.constraint(equalTo: passcodeOptionsButton.topAnchor),
            passcodeOptionsView.centerXAnchor.constraint(equalTo: view.centerXAnchor)
        ])
        view.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(backgroundPressed)))
        
        passcodeScreenView = PasscodeScreenView(
            title: "zzz",
            replacedTitle: "xxx",
            subtitle: "rrrr",
            compactLayout: true,
            biometricPassAllowed: false,
            delegate: self,
            matchHeaderColors: false
        )
        view.backgroundColor = WTheme.sheetBackground
        passcodeScreenView.layer.cornerRadius = 16
        
        view.addSubview(passcodeScreenView)
        passcodeScreenView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            passcodeScreenView.leftAnchor.constraint(equalTo: view.leftAnchor),
            passcodeScreenView.rightAnchor.constraint(equalTo: view.rightAnchor),
            passcodeScreenView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
//        passcodeScreenView.enterPasscodeLabel.label.text = "aa"
        
        
        bringNavigationBarToFront()
    }

    public override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
    }

    @objc func passcodeOptionsPressed() {
        if passcodeOptionsButton.titleLabel?.text == lang("Use 6-digit Passcode") {
            passcodeOptionsDigitSelected(digits: 6)
            passcodeOptionsButton.setTitle(lang("Use 4-digit Passcode"), for: .normal)
        } else {
            passcodeOptionsDigitSelected(digits: 4)
            passcodeOptionsButton.setTitle(lang("Use 6-digit Passcode"), for: .normal)
        }
        //passcodeOptionsView.toggle()
    }
    
    @objc func backgroundPressed() {
        if passcodeOptionsView.visibility {
            passcodeOptionsView.toggle()
        }
    }
    
    // Called from ConfirmPasscodeVC when passcode is wrong
    func passcodesDoNotMatch() {
        headerView.lblDescription.text = lang("Passcodes don't match. Please try again.")
    }
}

extension SetPasscodeVC: PasscodeInputViewDelegate {
    func passcodeChanged(passcode: String) {
        headerView.animatedSticker?.toggle(!passcode.isEmpty)
    }
    func passcodeSelected(passcode: String) {
        view.isUserInteractionEnabled = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            guard let self else {return}
            view.isUserInteractionEnabled = true
            // push `ConfirmPasscode` view controller
            let confirmPasscodeVC = ConfirmPasscodeVC(onCompletion: onCompletion,
                                                      setPasscodeVC: self,
                                                      selectedPasscode: passcode)
            navigationController?.pushViewController(confirmPasscodeVC,
                                                     animated: true,
                                                     completion: { [weak self] in
                // make passcode empty on completion
                self?.passcodeInputView.currentPasscode = ""
                self?.passcodeScreenView.passcodeInputView.currentPasscode = ""
            })
        }
    }
}

extension SetPasscodeVC: WKeyboardObserverDelegate {
    public func keyboardWillShow(info: WKeyboardDisplayInfo) {
        bottomConstraint.constant = -info.height - SetPasscodeVC.passcodeOptionsFromBottom
    }
    
    public func keyboardWillHide(info: WKeyboardDisplayInfo) {
        bottomConstraint.constant = -SetPasscodeVC.passcodeOptionsFromBottom
    }
}

extension SetPasscodeVC: PasscodeOptionsViewDelegate {
    func passcodeOptionsDigitSelected(digits: Int) {
        passcodeInputView.setCirclesCount(to: digits)
        headerView.lblDescription.text = WStrings.SetPasscode_Text(digits: digits)
    }
}

#if DEBUG
@available(iOS 18.0, *)
#Preview {
    let _ = UIFont.registerAirFonts()
    UINavigationController(rootViewController: SetPasscodeVC(onCompletion: { _, _, _ in }))
}
#endif
