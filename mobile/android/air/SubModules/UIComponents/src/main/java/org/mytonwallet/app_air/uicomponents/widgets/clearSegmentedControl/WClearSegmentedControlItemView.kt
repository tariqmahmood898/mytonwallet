package org.mytonwallet.app_air.uicomponents.widgets.clearSegmentedControl

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ObjectAnimator
import android.content.Context
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.LinearInterpolator
import androidx.appcompat.widget.AppCompatImageView
import androidx.core.animation.doOnCancel
import androidx.core.content.ContextCompat
import androidx.core.view.isVisible
import org.mytonwallet.app_air.icons.R
import org.mytonwallet.app_air.uicomponents.AnimationConstants
import org.mytonwallet.app_air.uicomponents.extensions.dp
import org.mytonwallet.app_air.uicomponents.extensions.setPaddingLocalized
import org.mytonwallet.app_air.uicomponents.helpers.WFont
import org.mytonwallet.app_air.uicomponents.widgets.WCell
import org.mytonwallet.app_air.uicomponents.widgets.WLabel
import org.mytonwallet.app_air.uicomponents.widgets.WThemedView
import org.mytonwallet.app_air.uicomponents.widgets.clearSegmentedControl.WClearSegmentedControlItemView.TrailingButton.Arrow
import org.mytonwallet.app_air.uicomponents.widgets.clearSegmentedControl.WClearSegmentedControlItemView.TrailingButton.Remove
import org.mytonwallet.app_air.uicomponents.widgets.setBackgroundColor
import org.mytonwallet.app_air.walletbasecontext.theme.WColor
import org.mytonwallet.app_air.walletbasecontext.theme.color
import java.lang.Float.max

open class WClearSegmentedControlItemView(context: Context) :
    WCell(context, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.MATCH_PARENT)),
    WThemedView {

    internal val textView: WLabel
    internal val trailingImageView: AppCompatImageView
    private val arrowDrawable = ContextCompat.getDrawable(context, R.drawable.ic_arrow_bottom_24)
    private val removeDrawable = ContextCompat.getDrawable(context, R.drawable.ic_collection_remove)
    private var shakeAnimator: ObjectAnimator? = null

    // Trailing image animator
    private var crossfadeAnimator: ObjectAnimator? = null

    enum class TrailingButton {
        Arrow,
        Remove
    }

    private var trailingButton: TrailingButton = Arrow

    init {
        if (id == NO_ID) {
            id = generateViewId()
        }

        textView = WLabel(context).apply {
            layoutParams = LayoutParams(
                LayoutParams.WRAP_CONTENT,
                LayoutParams.WRAP_CONTENT
            ).apply {
                setStyle(16f, WFont.Medium)
                setPadding(16.dp, 5.dp, 16.dp, 5.dp)
                setSingleLine()
            }
        }

        trailingImageView = AppCompatImageView(context).apply {
            id = generateViewId()
            layoutParams = LayoutParams(
                20.dp,
                20.dp
            )
            setImageDrawable(arrowDrawable)
            alpha = 0f
            isVisible = false
        }

        addView(textView)
        addView(trailingImageView)

        setConstraints {
            toCenterX(textView)
            toEnd(trailingImageView, 8f)
            toCenterY(trailingImageView)
        }

        updateTheme()
    }

    var onRemove: (() -> Unit)? = null
    private var paintColor: Int? = null
    private var shouldShowBackground = false
    var item: WClearSegmentedControl.Item? = null
    fun configure(
        item: WClearSegmentedControl.Item,
        isInDragMode: Boolean,
        shouldRenderThumb: Boolean,
        isSelected: Boolean,
        paintColor: Int?,
        onRemove: (() -> Unit)?
    ) {
        this.arrowVisibility = item.arrowVisibility
        this.item = item
        textView.alpha = if (shouldRenderThumb) 1f else 0f
        textView.text = item.title
        this.onRemove = onRemove
        if (isInDragMode) {
            textView.setTextColor(if (isSelected) WColor.PrimaryText else WColor.SecondaryText)
            startShake()
        } else {
            stopShake()
        }
        shouldShowBackground = shouldRenderThumb && isSelected
        this.paintColor = paintColor
        updateTheme()
    }

    private fun startShake() {
        stopShake()
        shakeAnimator = ObjectAnimator.ofFloat(this, "rotation", 0f, -1f, 2f, -1f, 2f, 0f).apply {
            duration = AnimationConstants.SLOW_ANIMATION
            repeatCount = ObjectAnimator.INFINITE
            interpolator = LinearInterpolator()
            start()
        }
    }

    private fun stopShake() {
        shakeAnimator?.cancel()
        shakeAnimator = null
        rotation = 0f
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        stopShake()
        crossfadeAnimator?.cancel()
        crossfadeAnimator = null
    }

    var selectedEndPadding = 12.dp
    var arrowVisibility: Float? = null
        set(value) {
            val value = value ?: 0f
            field = value

            trailingImageView.apply {
                alpha = max(0f, value - 0.7f) * 10 / 3
                isVisible = value > 0

                val endPadding = if (value > 0) {
                    16.dp + (selectedEndPadding * value).toInt()
                } else {
                    16.dp
                }

                textView.setPaddingLocalized(16.dp, 5.dp, endPadding, 5.dp)
            }
        }

    fun setTrailingButton(button: TrailingButton) {
        if (trailingButton == button) return

        val newDrawable = when (button) {
            Arrow -> arrowDrawable
            Remove -> removeDrawable
        }

        trailingImageView.setOnClickListener(
            when (button) {
                Arrow -> null

                Remove -> {
                    {
                        onRemove?.invoke()
                    }
                }
            })

        selectedEndPadding = when (button) {
            Arrow -> {
                12.dp
            }

            Remove -> {
                16.dp
            }
        }

        crossfadeAnimator?.cancel()

        crossfadeAnimator =
            ObjectAnimator.ofFloat(trailingImageView, "alpha", trailingImageView.alpha, 0f).apply {
                duration = if ((arrowVisibility ?: 0f) > 0f)
                    AnimationConstants.VERY_QUICK_ANIMATION / 2
                else
                    0
                interpolator = AccelerateDecelerateInterpolator()
                doOnCancel {
                    removeAllListeners()
                    trailingImageView.setImageDrawable(newDrawable)
                }
                addListener(object : AnimatorListenerAdapter() {
                    override fun onAnimationEnd(animation: Animator) {
                        trailingImageView.setImageDrawable(newDrawable)

                        crossfadeAnimator = ObjectAnimator.ofFloat(
                            trailingImageView,
                            "alpha",
                            0f,
                            arrowVisibility ?: 0f
                        ).apply {
                            duration = AnimationConstants.VERY_QUICK_ANIMATION / 2
                            interpolator = AccelerateDecelerateInterpolator()
                            start()
                        }
                    }
                })
                start()
            }

        trailingButton = button
        updateTheme()
    }

    override fun updateTheme() {
        arrowDrawable?.setTint(WColor.PrimaryText.color)
        if (shouldShowBackground)
            setBackgroundColor(paintColor ?: WColor.SecondaryBackground.color, 16f.dp)
        else
            background = null
    }

}
