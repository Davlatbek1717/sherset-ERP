package uz.sherset.tsd

/**
 * G6 — OFLAYN NAVBATNI YUBORISH SIKLI.
 *
 * G5 skeletida navbat faqat YOZILARDI («Oflayn navbat AVTOMATIK bo'shamaydi»
 * — G5 hisobotining ochiq bandi). Bu sinf uni bo'shatadi.
 *
 * 🔴 QAT'IY KETMA-KET. Amallar bir vaqtda YUBORILMAYDI: omborchi qilgan
 * tartib ma'noli («ko'chirish» dan keyin «tasdiqlash» kelishi shart) va
 * parallel yuborish uni buzardi. Birinchi amal muvaffaqiyatli bo'lmaguncha
 * ikkinchisi yuborilmaydi.
 *
 * 🔴 IKKI XIL XATO — IKKI XIL QAROR (aynan shu farq navbatning tiqilib
 * qolishini oldini oladi):
 *  · **Qayta urinishga arziydi** (tarmoq, 5xx): navbat JOYIDA qoladi va
 *    keyingi urinishda yana yuboriladi. Yo'qotish yo'q.
 *  · **Arzimaydi** (4xx — so'rovning o'zi noto'g'ri, masalan yacheykada
 *    tovar qolmagan yoki qator allaqachon tasdiqlangan): amal navbatdan
 *    CHIQARILADI, aks holda u boshidagi joyni band qilib butun navbatni
 *    abadiy to'xtatib qo'yardi. Lekin JIMGINA emas — sabab bilan
 *    `queue.reject()` ga yoziladi va omborchi ekranida ko'rinadi (IS-5).
 *
 * Takror yuborish xavfsiz: har amal tanasida `clientOpId` bor va server
 * uni mutatsiya tranzaksiyasi ichida da'vo qiladi (`shared/client-op.ts`).
 */
class QueueSender(
    private val api: ApiClient,
    private val queue: ActionQueue,
) {

    /** Bitta yugurish natijasi — ekranda ko'rsatish uchun. */
    data class Result(val sent: Int, val rejected: Int, val left: Int, val offline: Boolean)

    /**
     * Navbatni boshidan bo'shatadi. IO thread'da chaqiriladi.
     *
     * `maxOps` — bitta yugurishda yuboriladigan chegara: navbat katta bo'lsa
     * ekran uzoq qotib qolmasin (qolgani keyingi yugurishda ketadi).
     */
    fun flush(maxOps: Int = 50): Result {
        var sent = 0
        var rejected = 0
        var offline = false

        while (sent + rejected < maxOps) {
            val action = queue.peek() ?: break
            try {
                api.send(action.method, action.path, action.body)
                queue.dropFirst()
                sent++
            } catch (e: ApiClient.ApiException) {
                if (e.retriable) {
                    // Aloqa yo'q yoki server vaqtincha yiqilgan — navbat
                    // JOYIDA qoladi va keyingi urinishda yana yuboriladi.
                    offline = true
                    break
                }
                queue.reject(action, e.message ?: ("HTTP " + e.code))
                queue.dropFirst()
                rejected++
            }
        }

        return Result(sent = sent, rejected = rejected, left = queue.size(), offline = offline)
    }
}
