package org.mytonwallet.app_air.uisettings.viewControllers.connectedApps

import android.content.Context
import android.util.TypedValue
import android.view.View
import android.view.View.TEXT_ALIGNMENT_CENTER
import android.view.ViewGroup
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import androidx.appcompat.widget.AppCompatTextView
import androidx.constraintlayout.widget.ConstraintLayout
import androidx.constraintlayout.widget.ConstraintLayout.LayoutParams.MATCH_CONSTRAINT
import androidx.lifecycle.ViewModelProvider
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import org.mytonwallet.app_air.uicomponents.R
import org.mytonwallet.app_air.uicomponents.adapter.BaseListItem
import org.mytonwallet.app_air.uicomponents.base.WViewControllerWithModelStore
import org.mytonwallet.app_air.uicomponents.base.showAlert
import org.mytonwallet.app_air.uicomponents.extensions.collectFlow
import org.mytonwallet.app_air.uicomponents.extensions.dp
import org.mytonwallet.app_air.uicomponents.helpers.WDividerItemDecoration
import org.mytonwallet.app_air.uicomponents.helpers.WFont
import org.mytonwallet.app_air.uicomponents.helpers.typeface
import org.mytonwallet.app_air.uicomponents.widgets.WAnimationView
import org.mytonwallet.app_air.uicomponents.widgets.WView
import org.mytonwallet.app_air.walletbasecontext.localization.LocaleController
import org.mytonwallet.app_air.walletbasecontext.theme.ViewConstants
import org.mytonwallet.app_air.walletbasecontext.theme.WColor
import org.mytonwallet.app_air.walletbasecontext.theme.color

class ConnectedAppsVC(context: Context) : WViewControllerWithModelStore(context) {

    private val connectedAppsViewModel by lazy {
        ViewModelProvider(this)[ConnectedAppsViewModel::class.java]
    }

    override val shouldDisplayBottomBar = true
    override val isSwipeBackAllowed = true

    private val rvAdapter = ConnectedAppsAdapter()
    private val recyclerView = RecyclerView(context).apply {
        id = View.generateViewId()
        adapter = rvAdapter
        val linearLayoutManager = LinearLayoutManager(context)
        linearLayoutManager.isSmoothScrollbarEnabled = true
        layoutManager = linearLayoutManager
        clipToPadding = false
        addItemDecoration(WDividerItemDecoration(context, 68f.dp, WColor.Background.color))
    }

    private val animationView: WAnimationView by lazy {
        val v = WAnimationView(context)
        v
    }

    private val noItemLabel = AppCompatTextView(context).apply {
        id = View.generateViewId()
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
        setLineHeight(TypedValue.COMPLEX_UNIT_SP, 26f)
        includeFontPadding = false
        typeface = WFont.Medium.typeface
        textAlignment = TEXT_ALIGNMENT_CENTER
        text =
            LocaleController.getString("You have no apps connected to this wallet.")
    }

    private val noItemView = WView(context).apply {
        id = View.generateViewId()
        layoutParams = ViewGroup.LayoutParams(0, 0)
        visibility = View.INVISIBLE

        addView(animationView, ViewGroup.LayoutParams(124.dp, 124.dp))
        addView(
            noItemLabel,
            ConstraintLayout.LayoutParams(MATCH_CONSTRAINT, WRAP_CONTENT)
        )
        setConstraints {
            toCenterY(animationView)
            toCenterX(animationView)
            topToBottom(noItemLabel, animationView, 8F)
            toStart(noItemLabel, 72f)
            toEnd(noItemLabel, 72f)
        }
    }

    override fun setupViews() {
        super.setupViews()

        setNavTitle(LocaleController.getString("Connected Dapps"))
        setupNavBar(true)

        rvAdapter.setOnItemClickListener(object : ConnectedAppsAdapter.OnClickListener {
            override fun onDisconnectAllClick() {
                showDisconnectAllDappsDialog()
            }

            override fun onDisconnectClick(item: Item.DApp) {
                connectedAppsViewModel.deleteConnectedApp(item.app)
            }
        })
        recyclerView.setPadding(
            ViewConstants.HORIZONTAL_PADDINGS.dp,
            navigationBar?.calculatedMinHeight ?: 0,
            ViewConstants.HORIZONTAL_PADDINGS.dp,
            0
        )
        recyclerView.clipToPadding = false

        view.addView(noItemView)
        view.addView(
            recyclerView, ConstraintLayout.LayoutParams(
                MATCH_CONSTRAINT,
                MATCH_CONSTRAINT
            )
        )
        view.setConstraints {
            topToBottom(noItemView, navigationBar!!)
            toCenterX(noItemView)
            toBottomPx(noItemView, (navigationController?.getSystemBars()?.bottom ?: 0))

            toTop(recyclerView)
            toCenterX(recyclerView)
            toBottomPx(recyclerView, (navigationController?.getSystemBars()?.bottom ?: 0))
        }

        updateTheme()

        collectFlow(connectedAppsViewModel.uiItemsFlow, ::observeUiItems)
    }

    private fun observeUiItems(list: List<BaseListItem>) {
        if (list.size < 2) {
            recyclerView.visibility = View.INVISIBLE
            noItemView.visibility = View.VISIBLE
            animationView.play(R.raw.animation_empty, false) {}
        } else {
            rvAdapter.submitList(list)
            recyclerView.visibility = View.VISIBLE
            noItemView.visibility = View.INVISIBLE
        }
    }

    private fun showDisconnectAllDappsDialog() {
        showAlert(
            LocaleController.getString("Disconnect Dapps"),
            LocaleController.getString("Are you sure you want to disconnect all websites?"),
            LocaleController.getString("Disconnect"),
            { connectedAppsViewModel.deleteAllConnectedApp() },
            LocaleController.getString("Cancel"),
            preferPrimary = false,
            primaryIsDanger = true
        )
    }

    override fun updateTheme() {
        super.updateTheme()

        view.setBackgroundColor(WColor.SecondaryBackground.color)
        noItemLabel.setTextColor(WColor.PrimaryText.color)
    }

    override fun scrollToTop() {
        super.scrollToTop()
        recyclerView.layoutManager?.smoothScrollToPosition(recyclerView, null, 0)
    }
}
