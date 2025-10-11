package org.mytonwallet.app_air.uicomponents.adapter.implementation

import android.graphics.RectF
import android.graphics.Typeface
import org.mytonwallet.app_air.uicomponents.adapter.BaseListItem
import org.mytonwallet.app_air.uicomponents.image.Content
import org.mytonwallet.app_air.walletbasecontext.theme.WColor
import org.mytonwallet.app_air.walletcore.moshi.IApiToken
import org.mytonwallet.app_air.walletcore.moshi.MApiTransaction

open class Item(
    type: Int,
    key: String? = null
) : BaseListItem(type, key) {
    enum class Type {
        LIST_TITLE,
        LIST_TITLE_VALUE,
        ICON_DUAL_LINE,
        ADDRESS,
        ACTIVITY,
        EXPANDABLE_TEXT,
        GAP;

        val value: Int
            get() = -1 - this.ordinal
    }

    data class IconDualLine(
        val image: Content?,
        val title: CharSequence?,
        val subtitle: CharSequence?,
        val allowSeparator: Boolean = false,
        val id: String? = null,
        val isSensitiveData: Boolean = false,
        override val clickable: Clickable? = null
    ) : Item(Type.ICON_DUAL_LINE.value, id), IClickable

    data class ListTitle(
        val title: CharSequence,
        val paddingDp: RectF = RectF(20f, 16f, 20f, 8f),
        val gravity: Int? = null,
        val font: Typeface? = null,
        val textColor: WColor? = null,
        val textSize: Float? = null
    ) : Item(Type.LIST_TITLE.value, title.toString())

    data class ListTitleValue(
        val title: CharSequence,
        val value: CharSequence?
    ) : Item(Type.LIST_TITLE_VALUE.value, "${title}_$value")

    data class ExpandableText(
        val text: String
    ) : Item(Type.EXPANDABLE_TEXT.value, text)

    data class Address(
        val address: String,
    ) : Item(Type.ADDRESS.value)

    data class Activity(
        val activity: MApiTransaction,
        val isFirst: Boolean,
        val isLast: Boolean,
    ) : Item(Type.ACTIVITY.value)

    data object Gap : Item(Type.GAP.value)

    interface IClickable {
        val clickable: Clickable?
    }

    sealed class Clickable {
        data class Token(val token: IApiToken) : Clickable()
        data class Items(val items: List<BaseListItem>) : Clickable()
        data class Index(val index: Int) : Clickable()
    }
}
