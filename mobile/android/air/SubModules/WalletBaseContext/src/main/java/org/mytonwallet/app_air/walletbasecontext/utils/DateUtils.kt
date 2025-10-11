package org.mytonwallet.app_air.walletbasecontext.utils

import org.mytonwallet.app_air.walletbasecontext.WBaseStorage
import org.mytonwallet.app_air.walletbasecontext.localization.LocaleController
import org.mytonwallet.app_air.walletbasecontext.localization.WLanguage
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

private val cal = Calendar.getInstance()
fun Date.isSameDayAs(date2: Date): Boolean {
    cal.time = this
    val year1 = cal.get(Calendar.YEAR)
    val month1 = cal.get(Calendar.MONTH)
    val day1 = cal.get(Calendar.DAY_OF_MONTH)

    cal.time = date2
    val year2 = cal.get(Calendar.YEAR)
    val month2 = cal.get(Calendar.MONTH)
    val day2 = cal.get(Calendar.DAY_OF_MONTH)

    return year1 == year2 && month1 == month2 && day1 == day2
}

fun Date.isSameYearAs(date2: Date): Boolean {
    val calendar = Calendar.getInstance()
    calendar.time = this
    val thisYear = calendar.get(Calendar.YEAR)

    calendar.time = date2
    val otherYear = calendar.get(Calendar.YEAR)

    return thisYear == otherYear
}

fun Date.formatDateAndTime(format: String? = null): String {
    val isRussian = WBaseStorage.getActiveLanguage() == WLanguage.RUSSIAN.langCode
    val defaultFormat = when {
        isRussian && isSameYearAs(Date()) -> "d MMM, HH:mm"
        isRussian -> "d MMM yyyy, HH:mm"
        isSameYearAs(Date()) -> "MMM dd, HH:mm"
        else -> "MMM dd yyyy, HH:mm"
    }
    val dateFormat = SimpleDateFormat(
        format ?: defaultFormat,
        Locale(WBaseStorage.getActiveLanguage())
    );
    return dateFormat.format(this);
}

fun Date.formatDateAndTime(period: MHistoryTimePeriod): String {
    val isRussian = WBaseStorage.getActiveLanguage() == WLanguage.RUSSIAN.langCode
    return formatDateAndTime(
        when (period) {
            MHistoryTimePeriod.YEAR, MHistoryTimePeriod.ALL -> {
                if (isRussian) "d MMM yyyy" else "MMM d, yyyy"
            }

            else -> {
                if (isRussian) "d MMM, HH:mm" else "MMM d, HH:mm"
            }
        }
    )
}

fun Date.formatTime(): String {
    return formatDateAndTime("HH:mm")
}

object DateUtils {

    fun formatDateAndTimeDotSeparated(timestamp: Long): String {
        return formatDateAndTimeSeparated(timestamp, "·")
    }

    fun formatDateAndTimeSeparated(timestamp: Long, separator: String): String {
        val date = Date(timestamp)

        val dayMonthFormat = SimpleDateFormat("d MMMM", Locale(WBaseStorage.getActiveLanguage()))
        val yearFormat = SimpleDateFormat("yyyy", Locale(WBaseStorage.getActiveLanguage()))
        val timeFormat = SimpleDateFormat("HH:mm", Locale(WBaseStorage.getActiveLanguage()))

        val dayMonth = dayMonthFormat.format(date)
        val year = yearFormat.format(date)
        val time = timeFormat.format(date)

        return if (date.isSameYearAs(Date())) "$dayMonth $separator $time" else "$dayMonth $year $separator $time"
    }

    fun formatDayMonth(timestamp: Long): String {
        val date = Date(timestamp)

        val dayMonthFormat = SimpleDateFormat("d MMMM", Locale(WBaseStorage.getActiveLanguage()))

        val dayMonth = dayMonthFormat.format(date)

        return dayMonth
    }

    fun formatTimeToWait(remainingMs: Long): String {
        val remainingSeconds = remainingMs / 1000
        if (remainingSeconds < 0)
            return ""
        val days: Int = (remainingSeconds / (24 * 3600)).toInt()
        val hours: Int = ((remainingSeconds % (24 * 3600)) / 3600).toInt()
        val minutes: Int = ((remainingSeconds % 3600) / 60).toInt()

        val parts = mutableListOf<String>()

        if (days > 0) parts.add(
            LocaleController.getPlural(days, "day")
        )
        if (hours > 0) parts.add(LocaleController.getPlural(hours, "hour"))
        if (minutes > 0) parts.add(LocaleController.getPlural(minutes, "minute"))

        return parts.joinToString(" ")
    }
}
