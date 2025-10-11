package org.mytonwallet.app_air.uiassets.viewControllers.assets

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.LinearLayout
import androidx.constraintlayout.widget.ConstraintLayout.LayoutParams
import androidx.core.content.ContextCompat
import androidx.core.view.setPadding
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.ItemTouchHelper
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import org.mytonwallet.app_air.uiassets.viewControllers.assets.AssetsVC.CollectionMode.SingleCollection
import org.mytonwallet.app_air.uiassets.viewControllers.assets.AssetsVC.CollectionMode.TelegramGifts
import org.mytonwallet.app_air.uiassets.viewControllers.assets.cells.AssetCell
import org.mytonwallet.app_air.uiassets.viewControllers.assets.views.EmptyCollectionsView
import org.mytonwallet.app_air.uiassets.viewControllers.assetsTab.AssetsTabVC
import org.mytonwallet.app_air.uiassets.viewControllers.nft.NftVC
import org.mytonwallet.app_air.uicomponents.AnimationConstants
import org.mytonwallet.app_air.uicomponents.R
import org.mytonwallet.app_air.uicomponents.base.ISortableView
import org.mytonwallet.app_air.uicomponents.base.WNavigationBar
import org.mytonwallet.app_air.uicomponents.base.WNavigationController
import org.mytonwallet.app_air.uicomponents.base.WRecyclerViewAdapter
import org.mytonwallet.app_air.uicomponents.base.WViewController
import org.mytonwallet.app_air.uicomponents.base.WWindow
import org.mytonwallet.app_air.uicomponents.commonViews.WEmptyIconView
import org.mytonwallet.app_air.uicomponents.commonViews.cells.ShowAllView
import org.mytonwallet.app_air.uicomponents.extensions.dp
import org.mytonwallet.app_air.uicomponents.helpers.CubicBezierInterpolator
import org.mytonwallet.app_air.uicomponents.helpers.SpacesItemDecoration
import org.mytonwallet.app_air.uicomponents.widgets.WCell
import org.mytonwallet.app_air.uicomponents.widgets.WImageButton
import org.mytonwallet.app_air.uicomponents.widgets.WRecyclerView
import org.mytonwallet.app_air.uicomponents.widgets.WThemedView
import org.mytonwallet.app_air.uicomponents.widgets.WView
import org.mytonwallet.app_air.uicomponents.widgets.addRippleEffect
import org.mytonwallet.app_air.uicomponents.widgets.fadeIn
import org.mytonwallet.app_air.uicomponents.widgets.fadeOut
import org.mytonwallet.app_air.uicomponents.widgets.menu.WMenuPopup
import org.mytonwallet.app_air.uicomponents.widgets.recyclerView.CustomItemTouchHelper
import org.mytonwallet.app_air.uicomponents.widgets.segmentedController.WSegmentedControllerItemVC
import org.mytonwallet.app_air.walletcontext.globalStorage.WGlobalStorage
import org.mytonwallet.app_air.walletbasecontext.localization.LocaleController
import org.mytonwallet.app_air.walletbasecontext.theme.ViewConstants
import org.mytonwallet.app_air.walletbasecontext.theme.WColor
import org.mytonwallet.app_air.walletbasecontext.theme.color
import org.mytonwallet.app_air.walletcontext.utils.IndexPath
import org.mytonwallet.app_air.walletcore.WalletCore
import org.mytonwallet.app_air.walletcore.WalletEvent
import org.mytonwallet.app_air.walletcore.models.NftCollection
import org.mytonwallet.app_air.walletcore.moshi.ApiNft
import org.mytonwallet.app_air.walletcore.stores.AccountStore
import java.lang.ref.WeakReference
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

@SuppressLint("ViewConstructor")
class AssetsVC(
    context: Context,
    private val mode: Mode,
    private var injectedWindow: WWindow? = null,
    val collectionMode: CollectionMode? = null,
    val isShowingSingleCollection: Boolean,
    private val allowReordering: Boolean = true,
    private val onHeightChanged: (() -> Unit)? = null,
    private val onScroll: ((rv: RecyclerView) -> Unit)? = null,
    private val onReorderingRequested: (() -> Unit)? = null,
) : WViewController(context),
    WRecyclerViewAdapter.WRecyclerViewDataSource, AssetsVM.Delegate,
    WSegmentedControllerItemVC,
    ISortableView {

    val identifier: String
        get() {
            return when (collectionMode) {
                is SingleCollection -> {
                    collectionMode.collection.address
                }

                TelegramGifts -> {
                    NftCollection.TELEGRAM_GIFTS_SUPER_COLLECTION
                }

                null -> AssetsTabVC.TAB_COLLECTIBLES
            }
        }

    enum class Mode {
        THUMB,
        COMPLETE
    }

    sealed class CollectionMode {
        data object TelegramGifts : CollectionMode()
        data class SingleCollection(val collection: NftCollection) : CollectionMode()

        val collectionAddress: String
            get() {
                return when (this) {
                    is SingleCollection -> {
                        collection.address
                    }

                    TelegramGifts -> {
                        NftCollection.TELEGRAM_GIFTS_SUPER_COLLECTION
                    }
                }
            }

        fun matches(comparing: CollectionMode): Boolean {
            return when (this) {
                is SingleCollection -> {
                    comparing is SingleCollection && comparing.collection.address == collection.address
                }

                TelegramGifts -> {
                    comparing is TelegramGifts
                }
            }
        }
    }

    companion object {
        val ASSET_CELL = WCell.Type(1)
    }

    override val shouldDisplayBottomBar = isShowingSingleCollection

    override var title: String?
        get() {
            return collectionMode.title
        }
        set(_) {
        }

    override val isSwipeBackAllowed = isShowingSingleCollection

    override val shouldDisplayTopBar = isShowingSingleCollection

    private val assetsVM by lazy {
        AssetsVM(collectionMode, this)
    }

    private val thereAreMoreToShow: Boolean
        get() {
            return (assetsVM.nfts?.size ?: 0) > 6
        }

    var currentHeight: Int? = null
    private val finalHeight: Int
        get() {
            return if (assetsVM.nfts.isNullOrEmpty())
                224.dp
            else {
                val rows = if ((assetsVM.nfts?.size ?: 0) > 3) 2 else 1
                rows * (recyclerView.width - 32.dp) / 3 +
                    4.dp +
                    (if (thereAreMoreToShow) 56 else 8).dp
            }
        }

    private val rvAdapter =
        WRecyclerViewAdapter(WeakReference(this), arrayOf(ASSET_CELL))

    private var emptyView: WView? = null
    var isDragging = false
        private set

    val saveOnDrag: Boolean
        get() {
            return mode == Mode.COMPLETE
        }

    private val itemTouchHelper by lazy {
        val callback = object : CustomItemTouchHelper.SimpleCallback(
            ItemTouchHelper.UP or ItemTouchHelper.DOWN or ItemTouchHelper.LEFT or ItemTouchHelper.RIGHT,
            0
        ) {

            override fun isLongPressDragEnabled(): Boolean {
                return allowReordering
            }

            override fun isItemViewSwipeEnabled(): Boolean {
                return false
            }

            override fun onMove(
                recyclerView: RecyclerView,
                viewHolder: RecyclerView.ViewHolder,
                target: RecyclerView.ViewHolder
            ): Boolean {
                val fromPosition = viewHolder.adapterPosition
                val toPosition = target.adapterPosition

                if (mode == Mode.THUMB) {
                    val maxPosition = min(6, assetsVM.nfts?.size ?: 0) - 1
                    if (toPosition > maxPosition) return false
                }

                assetsVM.moveItem(fromPosition, toPosition, shouldSave = saveOnDrag)
                rvAdapter.notifyItemMoved(fromPosition, toPosition)

                return true
            }

            override fun onSwiped(viewHolder: RecyclerView.ViewHolder, direction: Int) {
            }

            override fun onSelectedChanged(viewHolder: RecyclerView.ViewHolder?, actionState: Int) {
                super.onSelectedChanged(viewHolder, actionState)

                when (actionState) {
                    ItemTouchHelper.ACTION_STATE_DRAG -> {
                        if (!isDragging) {
                            isDragging = true

                            recyclerView.parent?.requestDisallowInterceptTouchEvent(true)

                            viewHolder?.itemView?.animate()?.alpha(0.8f)?.scaleX(1.05f)
                                ?.scaleY(1.05f)
                                ?.translationZ(8.dp.toFloat())
                                ?.setDuration(AnimationConstants.QUICK_ANIMATION)
                                ?.setInterpolator(CubicBezierInterpolator.EASE_OUT)?.start()
                        }
                    }

                    ItemTouchHelper.ACTION_STATE_IDLE -> {
                        if (isDragging) {
                            isDragging = false

                            recyclerView.parent?.requestDisallowInterceptTouchEvent(false)

                            viewHolder?.itemView?.animate()?.alpha(1.0f)?.scaleX(1.0f)?.scaleY(1.0f)
                                ?.translationZ(0f)?.setDuration(AnimationConstants.QUICK_ANIMATION)
                                ?.setInterpolator(CubicBezierInterpolator.EASE_IN)?.start()
                        }
                    }
                }
            }

            override fun clearView(
                recyclerView: RecyclerView,
                viewHolder: RecyclerView.ViewHolder
            ) {
                super.clearView(recyclerView, viewHolder)

                recyclerView.parent?.requestDisallowInterceptTouchEvent(false)

                viewHolder.itemView.animate()
                    .alpha(1.0f)
                    .scaleX(1.0f)
                    .scaleY(1.0f)
                    .translationZ(0f)
                    .setDuration(AnimationConstants.QUICK_ANIMATION)
                    .setInterpolator(CubicBezierInterpolator.EASE_IN)
                    .start()
            }

            override fun getMovementFlags(
                recyclerView: RecyclerView,
                viewHolder: RecyclerView.ViewHolder
            ): Int {
                return if (allowReordering) {
                    val dragFlags = ItemTouchHelper.UP or ItemTouchHelper.DOWN or
                        ItemTouchHelper.LEFT or ItemTouchHelper.RIGHT
                    makeMovementFlags(dragFlags, 0)
                } else {
                    0
                }
            }
        }
        CustomItemTouchHelper(callback)
    }

    private val scrollListener = object : RecyclerView.OnScrollListener() {
        override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
            super.onScrolled(recyclerView, dx, dy)
            if (dx == 0 && dy == 0)
                return
            updateBlurViews(recyclerView)
            onScroll?.invoke(recyclerView)
        }

        override fun onScrollStateChanged(recyclerView: RecyclerView, newState: Int) {
            super.onScrollStateChanged(recyclerView, newState)
            if (recyclerView.scrollState != RecyclerView.SCROLL_STATE_IDLE) {
                updateBlurViews(recyclerView)
                onScroll?.invoke(recyclerView)
            }
        }
    }

    private val recyclerViewTouchListener = object : RecyclerView.OnItemTouchListener {
        private var startedDrag = false
        private var touchDownX = 0f
        private var touchDownY = 0f
        private val mSwipeSlop = ViewConfiguration.get(context).scaledTouchSlop

        override fun onInterceptTouchEvent(rv: RecyclerView, e: MotionEvent): Boolean {
            when (e.action) {
                MotionEvent.ACTION_DOWN -> {
                    val child = rv.findChildViewUnder(e.x, e.y)

                    if (assetsVM.isInDragMode) {
                        val touchDownViewHolder = child?.let { rv.getChildViewHolder(child) }
                        if (touchDownViewHolder != null) {
                            itemTouchHelper.startDrag(touchDownViewHolder)
                            startedDrag = true
                        }
                        return false
                    }

                    startedDrag = false
                    touchDownX = e.x
                    touchDownY = e.y
                }

                MotionEvent.ACTION_MOVE -> {
                    if (startedDrag) {
                        return false
                    }

                    val dx = abs(e.x - touchDownX)
                    val dy = abs(e.y - touchDownY)
                    if (!startedDrag) {
                        if (dx > mSwipeSlop || dy > mSwipeSlop) {
                            startedDrag = true
                        }
                    }
                }

                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                }
            }

            return false
        }

        override fun onTouchEvent(rv: RecyclerView, e: MotionEvent) {
            itemTouchHelper.injectTouchEvent(e)
        }

        override fun onRequestDisallowInterceptTouchEvent(disallowIntercept: Boolean) {}
    }

    private val layoutManager = GridLayoutManager(context, calculateNoOfColumns())
    private val recyclerView: WRecyclerView by lazy {
        val rv = WRecyclerView(this)
        rv.adapter = rvAdapter
        layoutManager.isSmoothScrollbarEnabled = true
        rv.layoutManager = layoutManager
        rv.setLayoutManager(layoutManager)
        rv.clipToPadding = false
        when (mode) {
            Mode.THUMB -> {
                rv.setPadding(12.dp, 4.dp, 12.dp, 4.dp)
                rv.addItemDecoration(
                    SpacesItemDecoration(
                        0,
                        0
                    )
                )
            }

            Mode.COMPLETE -> {
                rv.setPadding(
                    0,
                    (navigationController?.getSystemBars()?.top ?: 0) +
                        WNavigationBar.DEFAULT_HEIGHT.dp,
                    0,
                    0
                )
                rv.addItemDecoration(
                    SpacesItemDecoration(
                        0,
                        4.dp
                    )
                )
            }
        }

        rv.addOnScrollListener(scrollListener)
        rv.addOnItemTouchListener(recyclerViewTouchListener)

        if (allowReordering) {
            itemTouchHelper.attachToRecyclerView(rv)
        }

        if (mode == Mode.COMPLETE && collectionMode == null)
            rv.disallowInterceptOnOverscroll()

        rv
    }

    private val showAllView: ShowAllView by lazy {
        val v = ShowAllView(context)
        v.titleLabel.text =
            LocaleController.getString("Show All Collectibles")
        v.onTap = {
            val window = injectedWindow ?: this.window!!
            val navVC = WNavigationController(window)
            navVC.setRoot(
                AssetsTabVC(
                    context,
                    defaultSelectedIdentifier = collectionMode?.collectionAddress
                        ?: AssetsTabVC.TAB_COLLECTIBLES
                )
            )
            window.present(navVC)
        }
        v.visibility = View.GONE
        v
    }

    private val pinButton: WImageButton by lazy {
        WImageButton(context).apply {
            setPadding(8.dp)
            setOnClickListener {
                val homeNftCollections =
                    WGlobalStorage.getHomeNftCollections(AccountStore.activeAccountId!!)
                if (isInHomeTabs) {
                    homeNftCollections.remove(homeCollectionAddress)
                } else {
                    if (!homeNftCollections.contains(homeCollectionAddress))
                        homeNftCollections.add(homeCollectionAddress)
                }
                WGlobalStorage.setHomeNftCollections(
                    AccountStore.activeAccountId!!,
                    homeNftCollections
                )
                WalletCore.notifyEvent(WalletEvent.HomeNftCollectionsUpdated)
                updatePinButton()
            }
        }
    }

    val homeCollectionAddress: String
        get() {
            return when (collectionMode) {
                is CollectionMode.SingleCollection -> {
                    collectionMode.collection.address
                }

                CollectionMode.TelegramGifts -> {
                    NftCollection.TELEGRAM_GIFTS_SUPER_COLLECTION
                }

                null -> throw Exception()
            }
        }
    private val isInHomeTabs: Boolean
        get() {
            val homeNftCollections =
                WGlobalStorage.getHomeNftCollections(AccountStore.activeAccountId!!)
            return homeNftCollections.contains(homeCollectionAddress)
        }

    private val moreButton: WImageButton by lazy {
        WImageButton(context).apply {
            setPadding(8.dp)
            setOnClickListener {
                val items = mutableListOf(
                    WMenuPopup.Item(
                        WMenuPopup.Item.Config.Item(
                            icon = WMenuPopup.Item.Config.Icon(
                                icon = org.mytonwallet.app_air.uiassets.R.drawable.ic_getgems,
                                tintColor = null,
                                iconSize = 28.dp
                            ),
                            title = "Getgems",
                        ),
                        false,
                    ) {
                        val url = when (collectionMode) {
                            is CollectionMode.SingleCollection -> {
                                "https://getgems.io/collection/${collectionMode.collection.address}"
                            }

                            CollectionMode.TelegramGifts -> {
                                "https://getgems.io/top-gifts"
                            }

                            null -> return@Item
                        }
                        openLink(url)
                    }
                )
                if (collectionMode == CollectionMode.TelegramGifts) {
                    items.add(
                        0,
                        WMenuPopup.Item(
                            WMenuPopup.Item.Config.Item(
                                icon = WMenuPopup.Item.Config.Icon(
                                    icon = org.mytonwallet.app_air.uiassets.R.drawable.ic_fragment,
                                    tintColor = null,
                                    iconSize = 28.dp
                                ),
                                title = "Fragment",
                            ),
                            false,
                        ) {
                            openLink("https://fragment.com/gifts")
                        })
                }
                if (collectionMode is CollectionMode.SingleCollection) {
                    items.add(
                        WMenuPopup.Item(
                            WMenuPopup.Item.Config.Item(
                                icon = WMenuPopup.Item.Config.Icon(
                                    icon = org.mytonwallet.app_air.uiassets.R.drawable.ic_tonscan,
                                    tintColor = null,
                                    iconSize = 28.dp
                                ),
                                title = "Tonscan",
                            ),
                            false,
                        ) {
                            openLink("https://tonscan.org/nft/${collectionMode.collection.address}")
                        }
                    )
                }
                WMenuPopup.present(
                    this,
                    items,
                    popupWidth = WRAP_CONTENT,
                    aboveView = true
                )
            }
        }
    }

    private val navTrailingView: LinearLayout by lazy {
        LinearLayout(context).apply {
            id = View.generateViewId()
            orientation = LinearLayout.HORIZONTAL
            addView(pinButton, LayoutParams(40.dp, 40.dp))
            addView(moreButton, LayoutParams(40.dp, 40.dp).apply {
                marginStart = 8.dp
            })
        }
    }

    override fun setupViews() {
        super.setupViews()

        setNavTitle(title!!)
        if (isShowingSingleCollection) {
            setupNavBar(true)
            navigationBar?.addTrailingView(navTrailingView, LayoutParams(WRAP_CONTENT, 40.dp))
        }
        view.addView(recyclerView, ViewGroup.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        if (mode == Mode.THUMB) {
            view.addView(showAllView, LayoutParams(MATCH_PARENT, 56.dp))
        }
        view.setConstraints {
            if (mode == Mode.THUMB) {
                toCenterX(showAllView)
            }
            if (isShowingSingleCollection)
                toCenterX(
                    recyclerView,
                    ViewConstants.HORIZONTAL_PADDINGS.toFloat()
                )
        }

        assetsVM.delegateIsReady()

        if (onReorderingRequested != null) {
            itemTouchHelper.setBeforeLongPressListener {
                assetsVM.isInDragMode = true
                onReorderingRequested.invoke()
                rvAdapter.updateVisibleCells()
            }
        }

        updateTheme()
        insetsUpdated()

        view.post {
            updateEmptyView()
            nftsUpdated()
        }
    }

    override fun updateTheme() {
        super.updateTheme()

        if (mode == Mode.THUMB) {
            view.background = null
        } else {
            view.setBackgroundColor(WColor.SecondaryBackground.color)
            recyclerView.setBackgroundColor(WColor.Background.color)
        }
        rvAdapter.reloadData()
        if (isShowingSingleCollection) {
            val moreDrawable =
                ContextCompat.getDrawable(
                    context,
                    org.mytonwallet.app_air.icons.R.drawable.ic_more
                )?.apply {
                    setTint(WColor.SecondaryText.color)
                }
            moreButton.setImageDrawable(moreDrawable)
            moreButton.background = null
            moreButton.addRippleEffect(WColor.BackgroundRipple.color, 20f.dp)

            updatePinButton()
        }
        updateEmptyView()
    }

    private fun updatePinButton() {
        val pinDrawable = ContextCompat.getDrawable(
            context,
            if (isInHomeTabs)
                org.mytonwallet.app_air.uiassets.R.drawable.ic_collection_unpin
            else
                org.mytonwallet.app_air.uiassets.R.drawable.ic_collection_pin
        )
        pinButton.setImageDrawable(pinDrawable)
        pinButton.background = null
        pinButton.addRippleEffect(WColor.BackgroundRipple.color, 20f.dp)
    }

    override fun insetsUpdated() {
        super.insetsUpdated()
        if (mode == Mode.COMPLETE) {
            recyclerView.setPadding(
                0,
                (navigationController?.getSystemBars()?.top ?: 0) +
                    WNavigationBar.DEFAULT_HEIGHT.dp,
                0,
                navigationController?.getSystemBars()?.bottom ?: 0
            )
        }
    }

    fun setAnimations(paused: Boolean) {
        val layoutManager = recyclerView.layoutManager as? LinearLayoutManager
        layoutManager?.let {
            val firstVisible = it.findFirstVisibleItemPosition()
            val lastVisible = it.findLastVisibleItemPosition()

            for (i in firstVisible..lastVisible) {
                val holder = recyclerView.findViewHolderForAdapterPosition(i)
                if (holder != null) {
                    (holder.itemView as AssetCell).apply {
                        if (paused)
                            pauseAnimation()
                        else
                            resumeAnimation()
                    }
                }
            }
        }
    }

    override fun scrollToTop() {
        super.scrollToTop()
        recyclerView.layoutManager?.smoothScrollToPosition(recyclerView, null, 0)
    }

    private fun onNftTap(nft: ApiNft) {
        val assetVC = NftVC(context, nft, assetsVM.nfts!!)
        val window = injectedWindow ?: window!!
        val tabNav = window.navigationControllers.last().tabBarController?.navigationController
        if (tabNav != null)
            tabNav.push(assetVC)
        else
            window.navigationControllers.last().push(assetVC)
    }

    override fun recyclerViewNumberOfSections(rv: RecyclerView): Int {
        return 1
    }

    override fun recyclerViewNumberOfItems(rv: RecyclerView, section: Int): Int {
        return when (mode) {
            Mode.COMPLETE -> assetsVM.nfts?.size ?: 0
            Mode.THUMB -> min(6, assetsVM.nfts?.size ?: 0)
        }
    }

    override fun recyclerViewCellType(
        rv: RecyclerView,
        indexPath: IndexPath
    ): WCell.Type {
        return ASSET_CELL
    }

    override fun recyclerViewCellView(rv: RecyclerView, cellType: WCell.Type): WCell {
        val cell = AssetCell(context, mode)
        cell.onTap = { nft ->
            onNftTap(nft)
        }
        return cell
    }

    override fun recyclerViewCellItemId(rv: RecyclerView, indexPath: IndexPath): String? {
        if (mode == Mode.THUMB)
            return assetsVM.nfts!![indexPath.row].image
        return null
    }

    override fun recyclerViewConfigureCell(
        rv: RecyclerView,
        cellHolder: WCell.Holder,
        indexPath: IndexPath
    ) {
        val cell = cellHolder.cell as AssetCell
        cell.configure(assetsVM.nfts!![indexPath.row], assetsVM.isInDragMode)
    }

    var isShowingEmptyView = false
    override fun updateEmptyView() {
        if (assetsVM.nfts == null) {
            if ((emptyView?.alpha ?: 0f) > 0) {
                isShowingEmptyView = false
                emptyView?.fadeOut(onCompletion = {
                    if (assetsVM.nfts == null)
                        emptyView?.visibility == View.GONE
                })
            }
        } else if (assetsVM.nfts!!.isEmpty()) {
            if (emptyView == null) {
                emptyView =
                    when (mode) {
                        Mode.COMPLETE -> {
                            WEmptyIconView(
                                context,
                                R.raw.animation_empty,
                                LocaleController.getString("You have no NFT in this wallet yet")
                            )
                        }

                        Mode.THUMB -> {
                            EmptyCollectionsView(injectedWindow ?: window!!)
                        }
                    }
                view.addView(emptyView!!, ViewGroup.LayoutParams(WRAP_CONTENT, WRAP_CONTENT))
                view.constraintSet().apply {
                    toCenterX(emptyView!!)
                    if (mode == Mode.COMPLETE)
                        toCenterY(emptyView!!)
                    else
                        toTop(emptyView!!, 85f)
                }.layout()
                isShowingEmptyView = true
            } else if (!isShowingEmptyView) {
                if ((emptyView as? WEmptyIconView)?.startedAnimation != false) {
                    isShowingEmptyView = true
                    emptyView?.visibility = View.VISIBLE
                    emptyView?.alpha = 1f
                    emptyView?.fadeIn()
                }
                (emptyView as? WThemedView)?.updateTheme()
            }
        } else {
            if (isShowingEmptyView) {
                isShowingEmptyView = false
                emptyView?.fadeOut(onCompletion = {
                    if (assetsVM.nfts?.isNotEmpty() != false)
                        emptyView?.visibility = View.GONE
                })
            }
        }
    }

    override fun nftsUpdated() {
        assetsVM.nfts?.size?.let { nftsCount ->
            setNavSubtitle(
                LocaleController.getStringWithKeyValues(
                    "%amount% NFTs",
                    listOf(
                        Pair("%amount%", nftsCount.toString())
                    )
                )
            )
        }
        layoutManager.spanCount = calculateNoOfColumns()
        rvAdapter.reloadData()
        if (mode == Mode.THUMB)
            updateRecyclerViewPaddingForCentering()
        showAllView.visibility = if (thereAreMoreToShow) View.VISIBLE else View.GONE

        if (mode == Mode.THUMB) {
            view.setConstraints {
                toTopPx(showAllView, finalHeight - 56.dp)
            }

            animateHeight()
        }
    }

    private fun animateHeight() {
        currentHeight?.let {
            ValueAnimator.ofInt(currentHeight!!, finalHeight).apply {
                duration = AnimationConstants.VERY_QUICK_ANIMATION
                interpolator = CubicBezierInterpolator.EASE_BOTH

                addUpdateListener { animator ->
                    currentHeight = animator.animatedValue as Int
                    onHeightChanged?.invoke()
                }
                addListener(object : AnimatorListenerAdapter() {
                    override fun onAnimationEnd(animation: Animator) {
                    }
                })

                start()
            }
        } ?: run {
            currentHeight = finalHeight
            onHeightChanged?.invoke()
        }
    }

    private fun calculateNoOfColumns(): Int {
        return if (mode == Mode.THUMB) (assetsVM.nfts?.size ?: 0).coerceIn(1, 3) else max(
            2,
            (view.width - 16.dp) / 182.dp
        )
    }

    private fun updateRecyclerViewPaddingForCentering() {
        val itemCount = assetsVM.nfts?.size ?: 0

        if (itemCount in 1..2) {
            val itemWidth = (recyclerView.width - 32.dp) / 3
            val totalItemsWidth = itemCount * itemWidth
            val availableWidth = recyclerView.width - 24.dp
            val horizontalPadding = if (totalItemsWidth < availableWidth) {
                (availableWidth - totalItemsWidth) / 2 + 12.dp
            } else {
                12.dp
            }

            recyclerView.setPadding(horizontalPadding, 4.dp, horizontalPadding, 4.dp)
        } else if (mode == Mode.THUMB) {
            recyclerView.setPadding(12.dp, 4.dp, 12.dp, 4.dp)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        recyclerView.onDestroy()
        itemTouchHelper.attachToRecyclerView(null)
        recyclerView.adapter = null
        recyclerView.removeAllViews()
    }

    override fun onFullyVisible() {
        setAnimations(paused = false)
    }

    override fun onPartiallyVisible() {
        setAnimations(paused = true)
    }

    private fun openLink(url: String) {
        WalletCore.notifyEvent(WalletEvent.OpenUrl(url))
    }

    override fun startSorting() {
        if (assetsVM.isInDragMode)
            return
        assetsVM.isInDragMode = true
        rvAdapter.reloadData()
    }

    override fun endSorting() {
        assetsVM.isInDragMode = false
        rvAdapter.reloadData()
    }

    fun saveList() {
        assetsVM.saveList()
    }

    fun reloadList() {
        assetsVM.updateNftsArray(keepOrder = false)
        rvAdapter.reloadData()
        /*if (hasChanged) {
            recyclerView.fadeOut(AnimationConstants.VERY_QUICK_ANIMATION) {
                rvAdapter.reloadData()
                recyclerView.fadeIn(AnimationConstants.VERY_QUICK_ANIMATION)
            }
        }*/
    }
}

val AssetsVC.CollectionMode?.title: String
    get() {
        return when (this) {
            is TelegramGifts -> {
                LocaleController.getString("Telegram Gifts")
            }

            is SingleCollection -> {
                collection.name
            }

            else -> {
                LocaleController.getString("Collectibles")
            }
        }
    }
