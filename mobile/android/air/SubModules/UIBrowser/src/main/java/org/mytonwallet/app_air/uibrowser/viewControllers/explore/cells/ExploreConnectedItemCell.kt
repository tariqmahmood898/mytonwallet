package org.mytonwallet.app_air.uibrowser.viewControllers.explore.cells

import android.annotation.SuppressLint
import android.content.Context
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import org.mytonwallet.app_air.uicomponents.extensions.dp
import org.mytonwallet.app_air.uicomponents.helpers.WFont
import org.mytonwallet.app_air.uicomponents.image.Content
import org.mytonwallet.app_air.uicomponents.image.WCustomImageView
import org.mytonwallet.app_air.uicomponents.widgets.WCell
import org.mytonwallet.app_air.uicomponents.widgets.WLabel
import org.mytonwallet.app_air.uicomponents.widgets.WThemedView
import org.mytonwallet.app_air.uicomponents.widgets.setBackgroundColor
import org.mytonwallet.app_air.walletbasecontext.theme.WColor
import org.mytonwallet.app_air.walletbasecontext.theme.color
import org.mytonwallet.app_air.walletcore.moshi.ApiDapp

@SuppressLint("ViewConstructor")
class ExploreConnectedItemCell(
    context: Context,
    private val onDAppTap: (site: ApiDapp) -> Unit,
) :
    WCell(context, LayoutParams(WRAP_CONTENT, 36.dp)),
    WThemedView {

    private val imageView = WCustomImageView(context).apply {
        defaultRounding = Content.Rounding.Radius(10f.dp)
    }

    private val titleLabel = WLabel(context).apply {
        setStyle(15f, WFont.Medium)
        maxLines = 1
    }

    override fun setupViews() {
        super.setupViews()

        layoutParams = (layoutParams as MarginLayoutParams).apply {
            marginStart = 12.dp
        }

        addView(imageView, LayoutParams(36.dp, 36.dp))
        addView(titleLabel, LayoutParams(WRAP_CONTENT, WRAP_CONTENT))
        setConstraints {
            toStart(imageView)
            toCenterY(imageView)
            startToEnd(titleLabel, imageView, 8f)
            toCenterY(titleLabel)
            toEnd(titleLabel, 12f)
        }

        setOnClickListener {
            dApp?.let {
                onDAppTap(it)
            }
        }
    }

    private var dApp: ApiDapp? = null
    fun configure(dApp: ApiDapp) {
        this.dApp = dApp
        dApp.iconUrl?.let { iconUrl ->
            imageView.set(Content.ofUrl(iconUrl))
        } ?: run {
            imageView.clear()
        }
        titleLabel.text = dApp.name
        updateTheme()
    }

    override fun updateTheme() {
        setBackgroundColor(WColor.GroupedBackground.color, 10f.dp)
        addRippleEffect(WColor.BackgroundRipple.color, 10f.dp)
        titleLabel.setTextColor(WColor.PrimaryText.color)
    }
}
