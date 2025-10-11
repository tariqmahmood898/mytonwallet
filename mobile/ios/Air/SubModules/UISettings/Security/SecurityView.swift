
import SwiftUI
import UIKit
import UIPasscode
import UIComponents
import WalletCore
import WalletContext


struct SecurityView: View {
    
    var password: String
    var navigationBarInset: CGFloat
    var onScroll: (CGFloat) -> ()
    
    @Namespace private var ns
    
    @State private var biometrics: Bool = AppStorageHelper.isBiometricActivated()
    @State private var autolockOption: MAutolockOption = AutolockStore.shared.autolockOption
    
    var body: some View {
        InsetList(topPadding: 8, spacing: 24) {
            backupSection
                .scrollPosition(ns: ns, offset: 8, callback: onScroll)
            passcodeSection
            autolockSection
        }
        .coordinateSpace(name: ns)
        .navigationBarInset(navigationBarInset)
    }
    
    // MARK: - Backup
    
    @ViewBuilder
    var backupSection: some View {
        if AccountStore.account?.type == .mnemonic {
            InsetSection {
                InsetButtonCell(alignment: .leading, verticalPadding: 0, action: onBackup) {
                    HStack(spacing: 16) {
                        Image.airBundle("BackupIcon")
                        Text(lang("$back_up_auth"))
                        Spacer()
                        Image.airBundle("RightArrowIcon")
                            .foregroundStyle(Color(WTheme.secondaryLabel))
                    }
                    .foregroundStyle(Color(WTheme.primaryLabel))
                    .frame(height: 44)
                }
            } header: {
                Text(lang("$back_up_auth"))
            }
        }
    }
    
    func onBackup() {
        guard let vc = topWViewController() else { return }
        guard AccountStore.account?.isHardware != true else {
            return
        }
        Task { @MainActor in
            if let accountId = AccountStore.accountId,
               let mnemonic = try? await Api.fetchMnemonic(accountId: accountId, password: password) {
                vc.navigationController?.pushViewController(RecoveryPhraseVC(wordList: mnemonic), animated: true)
            }
        }
    }
    
    // MARK: - Passcode
    
    @ViewBuilder
    var passcodeSection: some View {
        InsetSection {
            enableBiometrics
            changePasscode
        } header: {
            Text(lang("Passcode"))
        } footer: {
            Text(lang("The passcode will be changed for all your wallets."))
        }
    }
    
    @ViewBuilder
    var enableBiometrics: some View {
        InsetDetailCell(verticalPadding: 0) {
            Text(lang("Face ID"))
                .frame(height: 44)
        } value: {
            Toggle(lang("Face ID"), isOn: $biometrics)
                .toggleStyle(.switch)
                .labelsHidden()
        }
        .onChange(of: biometrics) { isOn in
            AppStorageHelper.save(isBiometricActivated: isOn)
        }
    }
    
    @ViewBuilder
    var changePasscode: some View {
        InsetButtonCell(alignment: .leading, action: onChangePasscode) {
            Text(lang("Change Passcode"))
        }
    }
    
    func onChangePasscode() {
        guard let vc = topWViewController() else { return }
        UnlockVC.presentAuth(on: vc, onDone: { passcode in
            if let passcode {
                vc.navigationController?.pushViewController(ChangePasscodeVC(step: .newPasscode(prevPasscode: passcode)), animated: true)
            }
        }, cancellable: true)
    }
    
    
    // MARK: - Auto-lock
    
    @ViewBuilder
    var autolockSection: some View {
        InsetSection {
            InsetDetailCell(verticalPadding: 0) {
                Text(lang("Lock the app after"))
            } value: {
                Color.clear.frame(width: 150, height: 44)
                    .overlay(alignment: .trailing) {
                        AutolockPicker(autolockOption: $autolockOption)
                        .fixedSize()
                    }
                
            }
        } header: {
            Text(lang("Auto-Lock"))
        }
        .onChange(of: autolockOption) { autolock in
            AutolockStore.shared.autolockOption = autolock
        }
    }
}


struct AutolockPicker: View {
    
    @Binding var autolockOption: MAutolockOption
    
    var body: some View {
        Menu {
            ForEach(MAutolockOption.allCases) { option in
                Button(action: { autolockOption = option }) {
                    Text(option.displayName)
                        .lineLimit(1)
                        .frame(width: 200, alignment: .trailing)
                        .tag(option)
                }
            }
        } label: {
            let arrow: Text = Text(Image(systemName: "arrow.up.and.down"))
                .font(.system(size: 13))
            Text("\(autolockOption.displayName) \(arrow)")
                .imageScale(.small)
                .padding(5)
                .contentShape(.rect)
        }
        .padding(-5)
        .fixedSize()
    }
}
