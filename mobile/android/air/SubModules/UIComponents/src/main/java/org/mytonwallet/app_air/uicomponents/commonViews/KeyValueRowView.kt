package org.mytonwallet.app_air.uicomponents.commonViews

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.text.TextUtils
import android.text.method.LinkMovementMethod
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import com.google.android.material.progressindicator.CircularProgressIndicator
import org.mytonwallet.app_air.uicomponents.drawable.SeparatorBackgroundDrawable
import org.mytonwallet.app_air.uicomponents.extensions.dp
import org.mytonwallet.app_air.uicomponents.widgets.WLabel
import org.mytonwallet.app_air.uicomponents.widgets.WThemedView
import org.mytonwallet.app_air.uicomponents.widgets.WView
import org.mytonwallet.app_air.uicomponents.widgets.fadeIn
import org.mytonwallet.app_air.uicomponents.widgets.sensitiveDataContainer.WSensitiveDataContainer
import org.mytonwallet.app_air.uicomponents.widgets.setBackgroundColor
import org.mytonwallet.app_air.walletbasecontext.theme.ViewConstants
import org.mytonwallet.app_air.walletbasecontext.theme.WColor
import org.mytonwallet.app_air.walletbasecontext.theme.color
import org.mytonwallet.app_air.walletbasecontext.localization.LocaleController

@SuppressLint("ViewConstructor")
class KeyValueRowView(
    context: Context,
    val key: String,
    private var value: CharSequence,
    val mode: Mode,
    private var isLast: Boolean,
) : WView(context, LayoutParams(MATCH_PARENT, WRAP_CONTENT)), WThemedView {

    enum class Mode {
        PRIMARY,
        SECONDARY,
        LINK
    }

    var isSensitiveData = false
        set(value) {
            field = value
            valueLabel.isSensitiveData = value
        }

    private val shouldShowSeparator: Boolean
        get() {
            return !isLast// || !ThemeManager.uiMode.hasRoundedCorners
        }

    private val separator = SeparatorBackgroundDrawable().apply {
        offsetStart = 20f.dp
        offsetEnd = 20f.dp
        allowSeparator = shouldShowSeparator
    }

    init {
        if (shouldShowSeparator)
            background = separator
    }

    private val keyLabel: WLabel by lazy {
        WLabel(context).apply {
            setStyle(16f)
            text = key
        }
    }

    val valueLabel: WSensitiveDataContainer<WLabel> by lazy {
        val lbl = WLabel(context).apply {
            setStyle(16f)
            text = value
            movementMethod = LinkMovementMethod.getInstance()
            highlightColor = Color.TRANSPARENT
            setSingleLine(true)
            ellipsize = TextUtils.TruncateAt.MARQUEE
            isHorizontalFadingEdgeEnabled = true
            isSelected = true
            if (LocaleController.isRTL)
                gravity = Gravity.LEFT
        }
        WSensitiveDataContainer(
            lbl,
            WSensitiveDataContainer.MaskConfig(
                6,
                2,
                Gravity.END or Gravity.CENTER_VERTICAL,
                protectContentLayoutSize = false
            )
        ).apply {
            isSensitiveData = false
        }
    }
    var valView: View? = null

    private var progressIndicator: CircularProgressIndicator? = null
    var isLoading: Boolean = false
        set(value) {
            field = value
            updateLoadingState()
        }

    init {
        minimumHeight = 56.dp
        addView(keyLabel, LayoutParams(WRAP_CONTENT, WRAP_CONTENT))
        addView(valueLabel, LayoutParams(WRAP_CONTENT, WRAP_CONTENT))
        setConstraints {
            setHorizontalBias(keyLabel.id, 0f)
            setHorizontalBias(valueLabel.id, 1f)
            constrainedWidth(valueLabel.id, true)
            toTop(keyLabel, 18f)
            toCenterY(valueLabel, 18f)
            toStart(keyLabel, 20f)
            startToEnd(valueLabel, keyLabel, 16f)
            toEnd(valueLabel, 20f)
            if (valView is WLabel) {
                startToEnd(valView!!, keyLabel, 16f)
            }
        }

        updateTheme()
    }

    override fun updateTheme() {
        keyLabel.setTextColor(
            when (mode) {
                Mode.PRIMARY -> {
                    WColor.PrimaryText.color
                }

                Mode.SECONDARY -> {
                    WColor.SecondaryText.color
                }

                Mode.LINK -> {
                    WColor.Tint.color
                }
            }
        )
        addRippleEffect(WColor.SecondaryBackground.color)
        valueLabel.contentView.setTextColor(WColor.PrimaryText.color)
        progressIndicator?.setIndicatorColor(WColor.SecondaryText.color)
    }

    fun setKey(newValue: String?) {
        keyLabel.text = newValue
    }

    fun setValue(newValue: CharSequence?, fadeIn: Boolean = false) {
        value = newValue ?: ""
        valueLabel.contentView.text = newValue
        if (fadeIn) {
            valueLabel.alpha = 0f
            valueLabel.fadeIn()
        }
    }

    private fun updateLoadingState() {
        if (progressIndicator == null) {
            progressIndicator = CircularProgressIndicator(context).apply {
                id = generateViewId()
                isIndeterminate = true
                setIndicatorColor(WColor.SecondaryText.color)
                indicatorSize = 28.dp
            }
            addView(
                progressIndicator,
                ViewGroup.LayoutParams(WRAP_CONTENT, WRAP_CONTENT)
            )
            setConstraints {
                toEnd(progressIndicator!!, 20f)
                toCenterY(progressIndicator!!)
            }
        }
        if (isLoading) {
            progressIndicator?.visibility = VISIBLE
        } else {
            progressIndicator?.visibility = GONE
        }
    }

    fun setValueView(valueView: View) {
        this.valView = valueView
        addView(
            valueView,
            LayoutParams(WRAP_CONTENT, WRAP_CONTENT)
        )
        (valueView as? WLabel)?.apply {
            setSingleLine(true)
            ellipsize = TextUtils.TruncateAt.MARQUEE
            isHorizontalFadingEdgeEnabled = true
            isSelected = true
        }
        setConstraints {
            constrainedWidth(valueView.id, true)
            setHorizontalBias(valueView.id, 1f)
            toEnd(valueView, 20f)
            toCenterY(valueView)
            if (valueView is WLabel) {
                startToEnd(valueView, keyLabel, 16f)
            } else {
                keyLabel.apply {
                    setSingleLine()
                    isHorizontalFadingEdgeEnabled = true
                    ellipsize = TextUtils.TruncateAt.MARQUEE
                    isSelected = true
                }
                constrainedWidth(keyLabel.id, true)
                endToStart(keyLabel, valueView, 4f)
            }
        }
    }

    override fun setBackgroundColor(color: Int) {
        if (shouldShowSeparator)
            separator.backgroundColor = color
        else
            setBackgroundColor(WColor.Background.color, 0f, ViewConstants.BIG_RADIUS.dp)
    }

    fun hideSeparator() {
        if (shouldShowSeparator) {
            separator.forceSeparator = false
            separator.allowSeparator = false
        }
    }

    fun setLast(isLast: Boolean) {
        this.isLast = isLast
        background = if (shouldShowSeparator)
            separator
        else
            null
    }
}
