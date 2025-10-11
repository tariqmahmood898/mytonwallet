package org.mytonwallet.app_air.uibrowser.viewControllers.explore.cells

import android.annotation.SuppressLint
import android.content.Context
import androidx.appcompat.widget.AppCompatImageView
import androidx.core.content.ContextCompat
import org.mytonwallet.app_air.uicomponents.extensions.dp
import org.mytonwallet.app_air.uicomponents.widgets.WCell
import org.mytonwallet.app_air.uicomponents.widgets.WThemedView
import org.mytonwallet.app_air.uicomponents.widgets.setBackgroundColor
import org.mytonwallet.app_air.walletbasecontext.theme.WColor
import org.mytonwallet.app_air.walletbasecontext.theme.color


@SuppressLint("ViewConstructor")
class ExploreConfigureCell(
    context: Context,
    private val onTap: () -> Unit,
) :
    WCell(context, LayoutParams(36.dp, 36.dp)),
    WThemedView {

    private val imageView = AppCompatImageView(context).apply {
        id = generateViewId()
        setImageDrawable(
            ContextCompat.getDrawable(
                context,
                org.mytonwallet.app_air.icons.R.drawable.ic_details
            )
        )
    }

    override fun setupViews() {
        super.setupViews()

        layoutParams = (layoutParams as MarginLayoutParams).apply {
            marginStart = 12.dp
        }

        addView(imageView, LayoutParams(20.dp, 20.dp))
        setConstraints {
            allEdges(imageView)
        }

        imageView.setOnClickListener {
            onTap()
        }
    }

    override fun updateTheme() {
        setBackgroundColor(WColor.GroupedBackground.color, 10f.dp)
        addRippleEffect(WColor.BackgroundRipple.color, 10f.dp)
    }

    fun configure() {
        updateTheme()
    }
}
