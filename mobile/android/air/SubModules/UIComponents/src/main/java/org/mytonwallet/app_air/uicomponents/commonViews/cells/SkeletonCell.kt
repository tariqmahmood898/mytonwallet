package org.mytonwallet.app_air.uicomponents.commonViews.cells

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.view.View
import org.mytonwallet.app_air.uicomponents.drawable.SeparatorBackgroundDrawable
import org.mytonwallet.app_air.uicomponents.extensions.dp
import org.mytonwallet.app_air.uicomponents.widgets.WBaseView
import org.mytonwallet.app_air.uicomponents.widgets.WCell
import org.mytonwallet.app_air.uicomponents.widgets.WThemedView
import org.mytonwallet.app_air.uicomponents.widgets.setBackgroundColor
import org.mytonwallet.app_air.walletbasecontext.theme.ViewConstants
import org.mytonwallet.app_air.walletbasecontext.theme.WColor
import org.mytonwallet.app_air.walletbasecontext.theme.color

@SuppressLint("ViewConstructor")
class SkeletonCell(
    context: Context,
) : WCell(context), WThemedView, SkeletonContainer {

    companion object {
        val TITLE_WIDTH = arrayOf(80, 120, 100, 90, 120)
        val SUBTITLE_WIDTH = arrayOf(38, 48, 40, 42, 38)

        val CIRCLE_SKELETON_RADIUS = 24f.dp
        val TITLE_SKELETON_RADIUS = 8f.dp
        val SUBTITLE_SKELETON_RADIUS = 7f.dp
    }

    private val circleSkeleton = WBaseView(context).apply {
        layoutParams = LayoutParams(48.dp, 48.dp)
    }

    private val titleSkeleton = WBaseView(context).apply {
        layoutParams = LayoutParams(80.dp, 16.dp)
    }

    private val subtitleSkeleton = WBaseView(context).apply {
        layoutParams = LayoutParams(38.dp, 14.dp)
    }

    private val backgroundDrawable = SeparatorBackgroundDrawable().apply {
        backgroundColor = Color.TRANSPARENT
        separatorWColor = WColor.SecondaryBackground
        offsetStart = 76f.dp
        offsetEnd = 20f.dp
    }

    override fun setupViews() {
        super.setupViews()

        layoutParams.height = 64.dp

        addView(circleSkeleton)
        addView(titleSkeleton)
        addView(subtitleSkeleton)
        setConstraints {
            toTop(circleSkeleton, 8f)
            toStart(circleSkeleton, 13f)
            toTop(titleSkeleton, 14f)
            toStart(titleSkeleton, 72f)
            toTop(subtitleSkeleton, 36f)
            toStart(subtitleSkeleton, 72f)
        }

        background = backgroundDrawable
        updateTheme()
    }

    private var isFirst: Boolean = false
    private var isLast: Boolean = false
    fun configure(item: Int, isFirst: Boolean, isLast: Boolean) {
        this.isFirst = isFirst
        this.isLast = isLast
        val titleLayoutParams = titleSkeleton.layoutParams
        titleLayoutParams.width = TITLE_WIDTH[item % TITLE_WIDTH.size].dp
        titleSkeleton.layoutParams = titleLayoutParams
        val subtitleLayoutParams = subtitleSkeleton.layoutParams
        subtitleLayoutParams.width = SUBTITLE_WIDTH[item % SUBTITLE_WIDTH.size].dp
        subtitleSkeleton.layoutParams = subtitleLayoutParams
    }

    override fun updateTheme() {
        setBackgroundColor(
            WColor.Background.color,
            if (isFirst) ViewConstants.BIG_RADIUS.dp else 0f.dp,
            if (isLast) ViewConstants.BIG_RADIUS.dp else 0f.dp,
        )
        circleSkeleton.setBackgroundColor(WColor.SecondaryBackground.color, CIRCLE_SKELETON_RADIUS)
        titleSkeleton.setBackgroundColor(WColor.SecondaryBackground.color, TITLE_SKELETON_RADIUS)
        subtitleSkeleton.setBackgroundColor(
            WColor.SecondaryBackground.color,
            SUBTITLE_SKELETON_RADIUS
        )
        backgroundDrawable.invalidateSelf()
    }

    override fun getChildViewMap(): HashMap<View, Float> = hashMapOf(
        (circleSkeleton to CIRCLE_SKELETON_RADIUS),
        (titleSkeleton to TITLE_SKELETON_RADIUS),
        (subtitleSkeleton to SUBTITLE_SKELETON_RADIUS)
    )
}
