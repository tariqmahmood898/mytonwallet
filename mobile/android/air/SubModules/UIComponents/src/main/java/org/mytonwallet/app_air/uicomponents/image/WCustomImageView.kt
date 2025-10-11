package org.mytonwallet.app_air.uicomponents.image

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Path
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.util.AttributeSet
import androidx.appcompat.content.res.AppCompatResources
import androidx.core.content.ContextCompat
import com.facebook.drawee.backends.pipeline.Fresco
import com.facebook.drawee.generic.GenericDraweeHierarchyBuilder
import com.facebook.drawee.generic.RoundingParams
import com.facebook.drawee.interfaces.DraweeController
import com.facebook.drawee.view.SimpleDraweeView
import com.facebook.imagepipeline.request.ImageRequest
import org.mytonwallet.app_air.uicomponents.drawable.ContentGradientDrawable
import org.mytonwallet.app_air.uicomponents.extensions.dp
import org.mytonwallet.app_air.uicomponents.extensions.setRounding
import org.mytonwallet.app_air.uicomponents.widgets.WThemedView
import org.mytonwallet.app_air.walletbasecontext.theme.WColor
import org.mytonwallet.app_air.walletbasecontext.theme.color
import org.mytonwallet.app_air.walletbasecontext.utils.gradientColors
import org.mytonwallet.app_air.walletcore.models.MToken

open class WCustomImageView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyle: Int = 0,
) : SimpleDraweeView(context, attrs, defStyle), WThemedView {

    companion object {
        const val CHAIN_SIZE = 16
    }

    private var chainDrawable: Drawable? = null
    private var content: Content? = null
    private var lowResUrl: String? = null
    private val path = Path()

    var defaultRounding: Content.Rounding = Content.Rounding.Round
    var defaultPlaceholder: Content.Placeholder = Content.Placeholder.Color(WColor.BackgroundRipple)
    var chainSize: Int = CHAIN_SIZE.dp
    var chainSizeGap: Float = 1.5f.dp

    init {
        id = generateViewId()
        isFocusable = false
        isClickable = false
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        super.onMeasure(widthMeasureSpec, heightMeasureSpec)

        val chainRadius = chainSize / 2f

        path.reset()
        path.addRect(0f, 0f, measuredWidth.toFloat(), measuredHeight.toFloat(), Path.Direction.CW)
        path.addCircle(
            measuredWidth - chainRadius,
            measuredHeight - chainRadius,
            chainRadius + chainSizeGap,
            Path.Direction.CCW
        )
        path.close()
    }

    override fun onDraw(canvas: Canvas) {
        val needClip = chainDrawable != null && chainSize > 0
        if (needClip) {
            canvas.save()
            canvas.clipPath(path)
        }

        super.onDraw(canvas)
        if (needClip) {
            canvas.restore()
            chainDrawable?.let {
                it.setBounds(
                    measuredWidth - chainSize,
                    measuredHeight - chainSize,
                    measuredWidth,
                    measuredHeight
                )
                it.draw(canvas)
            }
        }
    }

    fun setAsset(token: MToken, alwaysShowChain: Boolean = false) {
        set(Content.of(token, alwaysShowChain), null)
    }

    fun set(content: Content, lowResUrl: String? = null) {
        this.hierarchy = buildHierarchy(content)
        this.controller = buildController(content, lowResUrl = lowResUrl)
        this.chainDrawable = if (content.subImageRes != 0)
            AppCompatResources.getDrawable(context, content.subImageRes)
        else null

        this.content = content
        this.lowResUrl = lowResUrl
        invalidate()
    }

    fun clear() {
        controller = buildController(null, null)
        chainDrawable = null
        content = null
        lowResUrl = null
        setImageDrawable(null)
        invalidate()
    }

    override fun updateTheme() {
        val content = this.content ?: return
        val placeholder = getPlaceholderMode(content)
        if (placeholder is Content.Placeholder.Color || content.image is Content.Image.Gradient) {
            hierarchy = buildHierarchy(content)
            controller = buildController(content, lowResUrl = lowResUrl)
        }
        invalidate()
    }

    /* Private */

    private fun buildController(content: Content?, lowResUrl: String?): DraweeController {
        return when (val image = content?.image) {
            is Content.Image.Empty,
            is Content.Image.Res,
            is Content.Image.Gradient,
            null -> Fresco.newDraweeControllerBuilder()
                .setOldController(controller)
                .setAutoPlayAnimations(true)
                .build()

            is Content.Image.Url -> Fresco.newDraweeControllerBuilder()
                .setOldController(controller)
                .setImageRequest(ImageRequest.fromUri(image.url))
                .setLowResImageRequest(ImageRequest.fromUri(lowResUrl))
                .build()
        }
    }

    private fun buildHierarchy(content: Content) = GenericDraweeHierarchyBuilder(resources).apply {
        setPlaceholderImage(getPlaceholderDrawable(content))
        setPlaceholderImageScaleType(content.scaleType)
        setActualImageScaleType(content.scaleType)
        setRoundingParams(getRoundingParams(content))
    }.build()

    private fun getRoundingMode(content: Content) =
        if (content.rounding !is Content.Rounding.Default)
            content.rounding else defaultRounding

    private fun getPlaceholderMode(content: Content) =
        if (content.placeholder !is Content.Placeholder.Default)
            content.placeholder else defaultPlaceholder

    private fun getRoundingParams(content: Content): RoundingParams {
        return when (val rounding = getRoundingMode(content)) {
            is Content.Rounding.Default -> throw IllegalArgumentException()
            is Content.Rounding.Round -> RoundingParams.asCircle()
            is Content.Rounding.Radius -> RoundingParams.fromCornersRadius(rounding.radius)
        }
    }

    private fun getPlaceholderDrawable(content: Content): Drawable? {
        return when (content.image) {
            is Content.Image.Res -> ContextCompat.getDrawable(context, content.image.res)
            is Content.Image.Gradient -> {
                val res = content.image.icon
                val drawable = if (res != 0) {
                    ContextCompat.getDrawable(context, res)?.apply {
                        setTint(Color.WHITE)
                    }
                } else null
                ContentGradientDrawable(
                    GradientDrawable.Orientation.TOP_BOTTOM,
                    content.image.key.gradientColors,
                    drawable
                ).apply {
                    setRounding(getRoundingMode(content))
                }
            }

            else -> when (val placeholder = getPlaceholderMode(content)) {
                is Content.Placeholder.Default -> throw IllegalArgumentException()
                is Content.Placeholder.Color -> ColorDrawable(placeholder.color.color)
            }
        }
    }
}
