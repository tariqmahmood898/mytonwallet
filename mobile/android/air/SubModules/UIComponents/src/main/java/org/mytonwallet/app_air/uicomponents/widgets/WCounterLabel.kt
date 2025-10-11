package org.mytonwallet.app_air.uicomponents.widgets

import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.text.TextPaint
import android.view.View
import org.mytonwallet.app_air.uicomponents.drawable.counter.Counter
import org.mytonwallet.app_air.uicomponents.extensions.dp
import org.mytonwallet.app_air.uicomponents.helpers.WFont
import org.mytonwallet.app_air.uicomponents.helpers.typeface
import org.mytonwallet.app_air.walletbasecontext.theme.WColor
import org.mytonwallet.app_air.walletbasecontext.theme.color
import org.mytonwallet.app_air.walletbasecontext.utils.smartDecimalsCount
import org.mytonwallet.app_air.walletbasecontext.utils.toString
import java.math.BigInteger

// TODO:: Should be refactored to fix `Positioning/Layout Issues`
class WCounterLabel(context: Context) : View(context), Counter.Callback, WThemedView {

    private var textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = WFont.Regular.typeface
        textSize = 16f.dp
    }
    private val counter = Counter(textPaint, this)

    init {
        updateTheme()
    }

    override fun dispatchDraw(canvas: Canvas) {
        super.dispatchDraw(canvas)
        counter.draw(
            canvas,
            measuredWidth - counter.getVisibleWidth() - paddingRight,
            measuredHeight / 2f + paddingTop,
            1f
        )
    }

    override fun updateTheme() {
        if (gradientColors == null) {
            textPaint.color = WColor.SecondaryText.color
        } else {
            applyGradient(measuredWidth.toFloat())
        }
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        super.onMeasure(
            MeasureSpec.makeMeasureSpec(
                counter.requiredWidth + paddingLeft + paddingRight,
                MeasureSpec.EXACTLY
            ),
            heightMeasureSpec
        )
        applyGradient(measuredWidth.toFloat())
    }

    override fun onCounterAppearanceChanged(counter: Counter, sizeChanged: Boolean) {
        invalidate()
    }

    override fun onCounterRequiredWidthChanged(counter: Counter) {
        requestLayout()
    }

    private fun applyGradient(x1: Float) {
        if (gradientColors == null) return

        val gradient = LinearGradient(
            0f, 0f,
            x1, 0f,
            gradientColors!!,
            null, Shader.TileMode.CLAMP
        )

        textPaint.shader = gradient
    }

    fun setStyle(size: Float, font: WFont? = null) {
        textPaint = textPaint.apply {
            typeface = (font ?: WFont.Regular).typeface
            textSize = size.dp
        }
    }

    private var gradientColors: IntArray? = null
    fun setGradientColor(gradientColors: IntArray?) {
        this.gradientColors = gradientColors
        applyGradient(measuredWidth.toFloat())
    }

    fun setTextColor(color: Int) {
        textPaint.color = color
        invalidate()
    }

    private var text: String? = null
    fun setAmount(text: String) {
        if (this.text == text) {
            return
        }
        this.text = text

        counter.setValue(text, isAttachedToWindow)
    }

    fun setAmount(
        amount: BigInteger,
        decimals: Int,
        currency: String,
        currencyDecimals: Int,
        smartDecimals: Boolean,
        showPositiveSign: Boolean = false,
        forceCurrencyToRight: Boolean
    ) {
        val formattedText = amount.toString(
            decimals = decimals,
            currency = currency,
            currencyDecimals = if (smartDecimals) amount.smartDecimalsCount(currencyDecimals) else currencyDecimals,
            showPositiveSign = showPositiveSign,
            forceCurrencyToRight = forceCurrencyToRight
        )

        if (this.text == formattedText) {
            return
        }

        this.text = formattedText
        counter.setValue(formattedText, isAttachedToWindow)
    }
}
