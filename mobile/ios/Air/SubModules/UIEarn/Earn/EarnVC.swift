//
//  EarnVC.swift
//  UIEarn
//
//  Created by Sina on 5/13/24.
//

import SwiftUI
import UIKit
import UIComponents
import WalletCore
import WalletContext
import OrderedCollections
import UIPasscode
import Ledger

@MainActor
public class EarnVC: WViewController, WSegmentedControllerContent, WSensitiveDataProtocol {
    
    private let earnVM: EarnVM
    
    var config: StakingConfig { earnVM.config }
    var tokenSlug: String { config.baseTokenSlug }
    var stakedTokenSlug: String { config.stakedTokenSlug }
    var token: ApiToken { config.baseToken }
    var stakedToken: ApiToken { config.stakedToken }
    var stakingState: ApiStakingState? { config.stakingState }

    var areProfitsCollapsed = true
    
    public init(earnVM: EarnVM) {
        self.earnVM = earnVM
        super.init(nibName: nil, bundle: nil)
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    public override var hideNavigationBar: Bool { true }
    
    public override func viewDidLoad() {
        super.viewDidLoad()

        setupViews()
        earnVM.delegate = self
        earnVM.loadInitialHistory()
    }

    private var separator: UIView!
    private var tableView: UITableView?
    private var dataSource: UITableViewDiffableDataSource<Section, Row>?
    private var tableViewBackgroundView: UIView!
    private var emptyView: EmptyEarnView!
    private var indicatorView: WActivityIndicator!
    private var belowSafeAreaView: UIView!
    private var belowSafeAreaHeightConstraint: NSLayoutConstraint!
    private let claimRewardsViewModel = ClaimRewardsModel()
    private var claimRewardsView: HostingView!
    
    enum Section: Hashable {
        case header
        case history
    }
    enum Row: Hashable {
        case header
        case historyHeader
        case historyItem(MStakingHistoryItem)
        case stackedProfits(aggregated: MStakingHistoryItem, startTimestamp: Int64, count: Int)
    }

    private func setupViews() {
        let tokenSlug = self.tokenSlug
        title = config.displayTitle

        let tableView = UITableView(frame: .zero, style: .grouped)
        self.tableView = tableView
        tableViewBackgroundView = UIView()
        tableView.backgroundView = tableViewBackgroundView
        tableView.translatesAutoresizingMaskIntoConstraints = false
        tableView.register(EarnHeaderCell.self, forCellReuseIdentifier: "EarnHeader")
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "EarnHistoryHeader")
        tableView.register(EarnHistoryCell.self, forCellReuseIdentifier: "EarnHistory")
        tableView.delegate = self
        tableView.separatorStyle = .none
        tableView.allowsSelection = false
        tableView.delaysContentTouches = false
        view.addSubview(tableView)
        NSLayoutConstraint.activate([
            tableView.leftAnchor.constraint(equalTo: view.leftAnchor),
            tableView.rightAnchor.constraint(equalTo: view.rightAnchor),
            tableView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        
        dataSource = UITableViewDiffableDataSource<Section, Row>(tableView: tableView) { [weak self] tableView, indexPath, itemIdentifier in
            guard let self else { fatalError() }
            switch itemIdentifier {
            case .header:
                let cell = tableView.dequeueReusableCell(withIdentifier: "EarnHeader", for: indexPath) as! EarnHeaderCell
                cell.configure(config: config, delegate: self)
                return cell

            case .historyHeader:
                let cell = tableView.dequeueReusableCell(withIdentifier: "EarnHistoryHeader", for: indexPath)
                cell.contentConfiguration = UIHostingConfiguration {
                    HStack(alignment: .firstTextBaseline) {
                        Text(lang("History"))
                            .font(.system(size: 20, weight: .bold))
                        Spacer()
                        if tokenSlug == TONCOIN_SLUG {
                            if let totalProfit = StakingStore.currentAccount?.totalProfit {
                                Text("\(lang("Earned")): \(formatBigIntText(totalProfit, currency: "TON", tokenDecimals: 9, decimalsCount: 9))")
                                    .font(.system(size: 16))
                                    .foregroundStyle(Color(WTheme.secondaryLabel))
                                    .sensitiveData(alignment: .trailing, cols: 14, rows: 2, cellSize: 8, theme: .adaptive, cornerRadius: 4)
                            }
                        }
                    }
                    .environment(\.isSensitiveDataHidden, AppStorageHelper.isSensitiveDataHidden)
                    .padding(.bottom, 2)
                }
                .background(Color.clear)
                // FIXME: Margins are not working
                return cell
                
            case .historyItem(let historyItem):
                let cell = tableView.dequeueReusableCell(withIdentifier: "EarnHistory", for: indexPath) as! EarnHistoryCell
                cell.configure(earnHistoryItem: historyItem, token: token)
                return cell
                
            case .stackedProfits(let profits, let startTimestamp, let count):
                let cell = tableView.dequeueReusableCell(withIdentifier: "EarnHistory", for: indexPath) as! EarnHistoryCell
                cell.configure(stackedProfits: profits, startTimestamp: startTimestamp, count: count, token: token)
                return cell
            }
        }
        dataSource?.defaultRowAnimation = .fade
        dataSource?.apply(makeSnapshot(), animatingDifferences: false)
        
        emptyView = EmptyEarnView(config: config)
        emptyView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(emptyView)
        let emptyViewTopConstraint = emptyView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 370)
        emptyViewTopConstraint.priority = .defaultLow
        NSLayoutConstraint.activate([
            emptyViewTopConstraint,
            emptyView.bottomAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -64),
            emptyView.centerXAnchor.constraint(equalTo: view.centerXAnchor)
        ])
        emptyView.alpha = 0
        
        indicatorView = WActivityIndicator()
        indicatorView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(indicatorView)
        NSLayoutConstraint.activate([
            indicatorView.centerXAnchor.constraint(equalTo: emptyView.centerXAnchor),
            indicatorView.centerYAnchor.constraint(equalTo: emptyView.centerYAnchor)
        ])
        if earnVM.historyItems == nil {
            indicatorView.startAnimating(animated: false)
        }
        
        belowSafeAreaView = UIView()
        belowSafeAreaView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(belowSafeAreaView)
        belowSafeAreaHeightConstraint = belowSafeAreaView.heightAnchor.constraint(equalToConstant: 56)
        NSLayoutConstraint.activate([
            belowSafeAreaView.topAnchor.constraint(equalTo: view.topAnchor),
            belowSafeAreaView.leftAnchor.constraint(equalTo: view.leftAnchor),
            belowSafeAreaView.rightAnchor.constraint(equalTo: view.rightAnchor),
            belowSafeAreaHeightConstraint
        ])
        
        addNavigationBar(title: nil, closeIcon: false)
        NSLayoutConstraint.activate([
            tableView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
        ])
        tableView.contentInset.top = navigationBarHeight
        tableView.verticalScrollIndicatorInsets.top = navigationBarHeight
        tableView.contentOffset.y = -navigationBarHeight
        
        bringNavigationBarToFront()
        
        claimRewardsViewModel.viewController = self
        claimRewardsViewModel.onClaim = { [weak self] in
            Task {
                do {
                    try await self?.claimRewardsViewModel.confirmAction(account: AccountStore.account.orThrow())
                    withAnimation(.default.delay(0.3)) {
                        self?.claimRewardsViewModel.isConfirming = false
                    }
                } catch {
                    topViewController()?.showAlert(error: error)
                }
            }
        }
        claimRewardsView = HostingView(ignoreSafeArea: false) { [claimRewardsViewModel] in
            ClaimRewardsView(viewModel: claimRewardsViewModel)
        }
        claimRewardsView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(claimRewardsView)
        NSLayoutConstraint.activate([
            claimRewardsView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            claimRewardsView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            claimRewardsView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        updateClaimRewardsButton()
        
        updateLoadingState()
        
        updateTheme()
    }
    
    public override func updateTheme() {
        belowSafeAreaView.backgroundColor = WTheme.sheetBackground
        tableViewBackgroundView.backgroundColor = WTheme.groupedItem
    }
    
    func updateClaimRewardsButton() {
        claimRewardsViewModel.token = token
        claimRewardsViewModel.stakingState = stakingState
        if case let .jetton(jetton) = stakingState {
            claimRewardsView.alpha = jetton.unclaimedRewards > 0 ? 1 : 0
            tableView?.contentInset.bottom = 56
        } else {
            claimRewardsView.alpha = 0
            tableView?.contentInset.bottom = 0
        }
    }
    
    func stakeUnstakePressed(isStake: Bool) {
        if let stakingState = earnVM.stakingState {
            if isStake {
                let vc = AddStakeVC(config: config, stakingState: stakingState)
                navigationController?.pushViewController(vc, animated: true)

            } else {
                if let readyToUnstakeAmount = config.readyToUnstakeAmount {
                    claimRewardsViewModel.onClaim()
                } else {
                    let vc = UnstakeVC(config: config, stakingState: stakingState)
                    navigationController?.pushViewController(vc, animated: true)
                }
            }
        }
    }
    
    private func updateLoadingState() {
        if emptyView.alpha == 0 && earnVM.historyItems != nil, earnVM.allLoadedOnce, let apy = stakingState?.apy {
            indicatorView.stopAnimating(animated: true)
            emptyView.estimatedAPYLabel.text = "\(lang("Estimated APY")) \(apy)%"
            if earnVM.historyItems?.count == 0 {
                UIView.animate(withDuration: 0.5) { [weak self] in
                    guard let self else {return}
                    emptyView.alpha = 1
                }
            }
        }
    }
    
    public func updateSensitiveData() {
        if let dataSource {
            var snapshot = dataSource.snapshot()
            snapshot.reconfigureItems([.historyHeader])
            dataSource.apply(snapshot)
        }
    }
    
    public var onScroll: ((CGFloat) -> Void)?
    public var onScrollStart: (() -> Void)?
    public var onScrollEnd: (() -> Void)?
    public var scrollingView: UIScrollView? { tableView }
}


extension EarnVC: UITableViewDelegate {
    
    func makeSnapshot() -> NSDiffableDataSourceSnapshot<Section, Row> {
        
        let historyItems = earnVM.historyItems ?? []
        
        var snapshot = NSDiffableDataSourceSnapshot<Section, Row>()
        snapshot.appendSections([.header])
        snapshot.appendItems([.header])
        snapshot.appendSections([.history])
        snapshot.appendItems([.historyHeader])
        
        var seenFirstProfit = false
        var profits: [MStakingHistoryItem] = []
        
        if areProfitsCollapsed {
            for historyItem in historyItems {
                switch historyItem.type {
                case .profit:
                    if seenFirstProfit {
                        profits.append(historyItem)
                    } else {
                        seenFirstProfit = true
                        snapshot.appendItems([.historyItem(historyItem)])
                    }
                    
                default:
                    if !profits.isEmpty {
                        let count = profits.count
                        if count == 1 {
                            snapshot.appendItems([.historyItem(profits[0])])
                        } else {
                            if var agg = profits.first, let last = profits.last {
                                agg.amount = profits.reduce(0) { $0 + $1.amount }
                                snapshot.appendItems([.stackedProfits(aggregated: agg, startTimestamp: last.timestamp, count: count)])
                            }
                        }
                        profits = []
                    }
                    snapshot.appendItems([.historyItem(historyItem)])
                }
            }
            
            if !profits.isEmpty {
                let count = profits.count
                if count == 1 {
                    snapshot.appendItems([.historyItem(profits[0])])
                } else {
                    if var agg = profits.first, let last = profits.last {
                        agg.amount = profits.reduce(0) { $0 + $1.amount }
                        snapshot.appendItems([.stackedProfits(aggregated: agg, startTimestamp: last.timestamp, count: count)])
                    }
                }
                profits = []
            }
        } else {
            snapshot.appendItems(historyItems.map { Row.historyItem($0)})
        }
        
        return snapshot
    }
    
    func applySnapshot(animated: Bool, reloadHeader: Bool = true) {
        var snapshot = makeSnapshot()
        if reloadHeader {
            snapshot.reconfigureItems([.header])
            if snapshot.indexOfItem(.historyHeader) != nil {
                snapshot.reconfigureItems([.historyHeader])
            }
        }
        dataSource?.apply(snapshot, animatingDifferences: animated)
    }
    
    public func tableView(_ tableView: UITableView, viewForHeaderInSection section: Int) -> UIView? {
        return nil
    }
    
    public func tableView(_ tableView: UITableView, heightForHeaderInSection section: Int) -> CGFloat {
        return 0
    }
    
    public func tableView(_ tableView: UITableView, heightForRowAt indexPath: IndexPath) -> CGFloat {
        if let id = dataSource?.itemIdentifier(for: indexPath), case .historyHeader = id {
            return 26 // FIXME: This is unnecessary but margins on UIContentConfiguration were not working
        }
        return UITableView.automaticDimension
    }
    
    public func tableView(_ tableView: UITableView, contextMenuConfigurationForRowAt indexPath: IndexPath, point: CGPoint) -> UIContextMenuConfiguration? {
        if let id = dataSource?.itemIdentifier(for: indexPath) {
            switch id {
            case .historyItem(let hisoryItem), .stackedProfits(let hisoryItem, _, _):
                let areProfitsCollapsed = self.areProfitsCollapsed
                if hisoryItem.type == .profit {
                    return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { _ in
                        let action = UIAction(title: areProfitsCollapsed ? "Expand" : "Collapse") { [weak self] v in
                            self?.areProfitsCollapsed.toggle()
                            self?.applySnapshot(animated: true)
                        }
                        return UIMenu(children: [action])
                    }
                }
            default:
                break
            }
        }
        return nil
    }
    
    public func tableView(_ tableView: UITableView, willDisplay cell: UITableViewCell, forRowAt indexPath: IndexPath) {
        let identifier = dataSource?.itemIdentifier(for: indexPath)
        if case .historyItem(let showingItem) = identifier {
            if let lastStakingItem = earnVM.lastStakingItem,
               showingItem.timestamp <= lastStakingItem {
                earnVM.loadMoreStakingHistory()
            }
            if let lastActivityItemTimestamp = earnVM.lastActivityItem?.1,
               showingItem.timestamp <= lastActivityItemTimestamp {
                earnVM.loadMoreActivityItems()
            }
            if let lastUnstakeActivityItemTimestamp = earnVM.lastUnstakeActivityItem?.1,
               showingItem.timestamp <= lastUnstakeActivityItemTimestamp {
                earnVM.loadMoreUnstakeActivityItems()
            }
        }
    }

    public func scrollViewDidScroll(_ scrollView: UIScrollView) {
        let y = scrollView.contentOffset.y + tableView!.contentInset.top
        if y > 0 {
            navigationBar?.showSeparator = true
        } else if y <= 0 {
            navigationBar?.showSeparator = false
        }
        belowSafeAreaHeightConstraint.constant = navigationBarHeight - y
    }
}

extension EarnVC: EarnMVDelegate {
    public func stakingStateUpdated() {
        updateLoadingState()
        applySnapshot(animated: true, reloadHeader: true)
        updateClaimRewardsButton()
    }
    
    public func newPageLoaded(animateChanges: Bool) {
        updateLoadingState()
        indicatorView.stopAnimating(animated: true)
        if animateChanges {
            applySnapshot(animated: true, reloadHeader: true)
        } else {
            UIView.transition(with: view, duration: 0.3, options: [.allowUserInteraction, .transitionCrossDissolve]) {
                self.applySnapshot(animated: false, reloadHeader: true)
            }
        }
    }
}
