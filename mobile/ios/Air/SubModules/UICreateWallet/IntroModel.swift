//
//  IntroNavigation.swift
//  MyTonWalletAir
//
//  Created by nikstar on 04.09.2025.
//

import UIKit
import SwiftUI
import WalletCore
import WalletContext
import UIComponents
import UIPasscode
import Ledger
import UIHome

private let log = Log("IntroActions")

@MainActor public final class IntroModel {
    
    private var password: String?
    private var words: [String]?
    
    var allowOpenWithoutChecking: Bool {
#if DEBUG
        return true
#else
        return Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt"
#endif
    }
    
    public init(password: String?, words: [String]? = nil) {
        self.password = password
        self.words = words
    }
       
    // MARK: - Navigation
    
    func onAbout() {
        push(AboutVC(introModel: self))
    }
    
    func onUseResponsibly() {
        push(UseResponsiblyVC(introModel: self))
    }
    
    func onCreateWallet() {
        push(CreateBackupDisclaimerVC(introModel: self))
    }
    
    func onImportExisting() {
        let vc = ImportExistingPickerVC(introModel: self)
        topWViewController()?.present(vc, animated: true)
    }
    
    func onImportMnemonic() {
        topWViewController()?.dismiss(animated: true, completion: {
            push(ImportWalletVC(introModel: self))
        })
    }
    
    func onAddViewWallet() {
        topWViewController()?.dismiss(animated: true, completion: {
            push(AddViewWalletVC(introModel: self))
        })
    }
    
    func onLedger() {
        topWViewController()?.dismiss(animated: true, completion: {
            Task { @MainActor in
                let model = await LedgerAddAccountModel()
                let vc = LedgerAddAccountVC(model: model, showBackButton: true)
                vc.onDone = { vc in
                    self.onDone(successKind: .imported)
                }
                push(vc)
            }
        })
    }
    
    func onGoToWords() {
        Task { @MainActor in
            do {
                let words = try await Api.generateMnemonic()
                self.words = words
                let nc = try getNavigationController()
                let wordsVC = WordDisplayVC(introModel: self, wordList: words)
                let intro = nc.viewControllers.first ?? IntroVC(introModel: self)
                push(wordsVC, completion: { _ in
                    nc.viewControllers = [intro, wordsVC] // remove disclaimer
                })
            } catch {
                log.error("onGoToWords: \(error)")
                assertionFailure("\(error)")
            }
        }
    }
    
    func onLetsCheck() {
        Task { @MainActor in
            do {
                let words = try words.orThrow()
                let allWords = try await Api.getMnemonicWordList()
                push(WordCheckVC(introModel: self, words: words, allWords: allWords))
            } catch {
                log.error("onLetsCheck: \(error, .public)")
            }
        }
    }
    
    func onOpenWithoutChecking() {
        onCheckPassed()
    }
    
    func onCheckPassed() {
        if let password = password?.nilIfEmpty {
            _createWallet(passcode: password, biometricsEnabled: nil)
        } else {
            let setPasscode = SetPasscodeVC(onCompletion: { biometricsEnabled, password, completion in
                self._createWallet(passcode: password, biometricsEnabled: biometricsEnabled)
            })
            push(setPasscode)
        }
    }
    
    public func onDone(successKind: SuccessKind) {
        if AccountStore.accountsById.count >= 2 {
            onOpenWallet()
        } else {
            let success = ImportSuccessVC(successKind, introModel: self)
            push(success) { nc in
                nc.viewControllers = [success] // no going back
            }
        }
    }
    
    func onWordInputContinue(words: [String]) {
        if let password = password?.nilIfEmpty {
            _importWallet(words: words, passcode: password, biometricsEnabled: nil)
        } else {
            let setPasscode = SetPasscodeVC(onCompletion: { biometricsEnabled, password, completion in
                self._importWallet(words: words, passcode: password, biometricsEnabled: biometricsEnabled)
            })
            push(setPasscode)
        }

    }
    
    func onAddViewWalletContinue(address: String) {
        Task {
            await _addViewWallet(address: address)
        }
    }
    
    func onOpenWallet() {
        Task { @MainActor in
            if WalletContextManager.delegate?.isWalletReady == true {
                topWViewController()?.dismiss(animated: true)
            } else {
                let homeVC = HomeTabBarController()
                AppActions.transitionToNewRootViewController(homeVC, animationDuration: 0.35)
            }
        }
    }
    
    // MARK: - Actions
    
    private func _createWallet(passcode: String, biometricsEnabled: Bool?) {
        Task { @MainActor in
            do {
                _ = try await AccountStore.createWallet(network: .mainnet, words: words.orThrow(), passcode: passcode, version: nil)
                KeychainHelper.save(biometricPasscode: passcode)
                if let biometricsEnabled { // nil if not first wallet
                    AppStorageHelper.save(isBiometricActivated: biometricsEnabled)
                }
                self.onDone(successKind: .created)
            } catch {
                log.error("_createWallet: \(error)")
            }
        }
    }
    
    private func _importWallet(words: [String], passcode: String, biometricsEnabled: Bool?) {
        Task { @MainActor in
            do {
                _ = try await AccountStore.importMnemonic(network: .mainnet, words: words, passcode: passcode, version: nil)
                KeychainHelper.save(biometricPasscode: passcode)
                if let biometricsEnabled { // nil if not first wallet
                    AppStorageHelper.save(isBiometricActivated: biometricsEnabled)
                }
                self.onDone(successKind: .imported)
            } catch {
                log.error("_importWallet: \(error)")
            }
        }
    }
    
    private func _addViewWallet(address: String) async {
        do {
            let chain: ApiChain = address.starts(with: "T") ? .tron : .ton
            let ton = chain == .ton ? address : nil
            let tron = chain == .tron ? address : nil
            _ = try await AccountStore.importViewWallet(network: .mainnet, tonAddress: ton, tronAddress: tron)
            self.onDone(successKind: .importedView)
        } catch {
            topWViewController()?.showAlert(error: error)
        }
    }
}

@MainActor private func getNavigationController() throws -> WNavigationController {
    try (topWViewController()?.navigationController as? WNavigationController).orThrow("can't find navigation controller")
}

@MainActor private func push(_ viewController: UIViewController, completion: ((UINavigationController) -> ())? = nil) {
    if let nc = topWViewController()?.navigationController {
        nc.pushViewController(viewController, animated: true, completion: { completion?(nc) })
    }
}
