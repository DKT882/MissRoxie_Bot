// Real, verified default Telegram sticker library for Roxie
// Every file_id has been verified against official Telegram sticker packs.
// Total verified stickers: 220 across 22 moods.

export interface DefaultStickerMeta {
  fileId: string;
  mood: string;
  packName: string;
  packTitle: string;
  emoji?: string;
}

export const DEFAULT_STICKERS_BY_MOOD: Record<string, string[]> = {
  "normal": [
    "CAACAgIAAxUAAWqUbAlZeyCFe_6hAAE41c2y_onefQACFQADwDZPE81WpjthnmTnPQQ",
    "CAACAgIAAxUAAWqUbAnsZkssmMHE1wnc2hf2QjIrAAITAAPANk8TqrOH9384yqU9BA",
    "CAACAgIAAxUAAWqUbAljtldp3hXMxGXu0ajfqm2DAAIQAAPANk8T6oGKKfEfAug9BA",
    "CAACAgIAAxUAAWqUbAms1eiRb5EclQABbjUjeflf4wAC6RsAAoV_EEnRch0GfnFH5z0E",
    "CAACAgIAAxUAAWqUbAc6TFZ_gQfSaiDoX8Atz2z-AALgAAP0exkAASzrKFdeleMwPQQ",
    "CAACAgIAAxUAAWqUbAekIolwiISG5wqRWmUX1V5xAAJoAQAC9HsZAAHwssSWsHaC_D0E",
    "CAACAgIAAxUAAWqUbAf4OnN-doWMvGUeBUtBRPaKAAMBAAL0exkAAfRksArkn456PQQ",
    "CAACAgIAAxUAAWqUbAfHeR3tmY0l9YC6v94-tI_vAAJkAQAC9HsZAAFn6aPvO59rLz0E",
    "CAACAgIAAxUAAWqUbAcdr_WvA3CRK5iNeezdX8IgAAJmAQAC9HsZAAHdZJKK6tGNzT0E",
    "CAACAgIAAxUAAWqUbAdvERu1X9l428mfCkQuOAQFAAJJAQAC9HsZAAEOsNjpiID-Lz0E"
  ],
  "friendly": [
    "CAACAgIAAxUAAWqUbAmm0-cAAbEQuucFAyRtLK9MBAACBQADwDZPE_lqX5qCa011PQQ",
    "CAACAgIAAxUAAWqUbAn3bnl5VAEIv1T1-zCL1s-1AAIKAAPANk8T_w2uPugO_Qg9BA",
    "CAACAgIAAxUAAWqUbAe0vGtlEIU7woH6RG9cf-B2AALeAAP0exkAAb2F7273xc49PQQ",
    "CAACAgIAAxUAAWqUbAf1hphbaniCXfZVmMOz70IdAAIEAQAC9HsZAAGAEeRAK8ac-z0E",
    "CAACAgIAAxUAAWqUbAc-kcJWgTzqZLZUSTOMO9BYAAILAQAC9HsZAAG4Cs7MocWO6z0E",
    "CAACAgIAAxUAAWqUbAcsoFXOCM3o5PPZ7BEnYCUrAAL-AAP0exkAAaAWf7umYeLZPQQ",
    "CAACAgIAAxUAAWqUbAfBpV17dz62Mbd2-KD8VTKQAAIPAQAC9HsZAAFm9DkUA1TM9D0E",
    "CAACAgIAAxUAAWqUbAdnoOSUGXw9rEZDiRbrokefAAJBAQAC9HsZAAFRWXXF49fe9z0E",
    "CAACAgIAAxUAAWqUbAcdwzlxhbaaLNyt_M920iF5AAJrAQAC9HsZAAGk_HvgqGvx8D0E",
    "CAACAgIAAxUAAWqUbAceZ_neVKQF9Vu6A5Q-OS4KAAL4AAP0exkAAQtRF3q3XTjpPQQ"
  ],
  "cute": [
    "CAACAgIAAxUAAWqUbAf7dKDIux8s5WhfEeXnb8PPAAIRAQAC9HsZAAH1nz_2mMhZ0D0E",
    "CAACAgIAAxUAAWqUbAdWjoahJXA6AAHR3WfE7QcnHwAC_AAD9HsZAAGAROatrwevYz0E",
    "CAACAgIAAxUAAWqUbAfvuSi1HoGAV2xTwOeMAnmnAAINAQAC9HsZAAEnr4wIdn4X0D0E",
    "CAACAgIAAxUAAWqUbAfxbO5gP_5QH89KmOnp7M3LAALqAAP0exkAAWOxd5rsdFPXPQQ",
    "CAACAgIAAxUAAWqUbAf_2OeRylZ1e4zIwYVdAzdKAALwAAP0exkAAS69_6O0CNR5PQQ",
    "CAACAgIAAxUAAWqUbAep2haNklWTzDnFwLXzO4iKAAJYPwACnyTRSF1mf3wBKVfuPQQ",
    "CAACAgIAAxUAAWqUbAejdUJBvGoJi5LhU5i-jGu8AALmAAP0exkAASlj8t1kwrmbPQQ",
    "CAACAgIAAxUAAWqUbEHrO5N3HC0H-LIk_deV_fGcAAIRAQACjmbJBXwrfTJV8iJcPQQ",
    "CAACAgUAAxUAAWqUbECXSG0ZJnKqKOQrW2jrl2FCAAJ1AwACQJ7ZVrjLJK2Tsw31PQQ",
    "CAACAgUAAxUAAWqUbEB2jynuouAgEuC4SJtPiD4gAAKlAwACWn7ZVsKDn4MnnwKhPQQ"
  ],
  "happy": [
    "CAACAgIAAxUAAWqUbAlJFpY6hqy15a9gy5UM3j2CAAIWAAPANk8TYCHXLaIEtmc9BA",
    "CAACAgIAAxUAAWqUbAn9RkB3qU9w07Nip3z23XHKAAIbAAPANk8Tfb2Kg8tETWo9BA",
    "CAACAgIAAxUAAWqUbAkro-o85crg99KrOYSx2850AAIcAAPANk8TwYIa0yz-DuE9BA",
    "CAACAgIAAxUAAWqUbAcoaDatde5uxDP2nP8zxFygAAI_AQAC9HsZAAFWKKg0qczYmj0E",
    "CAACAgIAAxUAAWqUbBmupf6drljaD0rChKMBUqQQAAIfAANlMwUl23Ft-XL16wY9BA",
    "CAACAgIAAxUAAWqUbBkTb6rFa6IWEQttzI-e7Z5kAAI1AANlMwUl6SBx9KOxUhI9BA",
    "CAACAgIAAxUAAWqUbBrBNVqdmDaQGlHve1CZIG3VAAIVDgACs7KhS4Mfio6jHlshPQQ",
    "CAACAgIAAxUAAWqUbAyNvQcnT9qONvL7SJk_Ze1AAAJvAAP3F4Er4slXqHY6fF89BA",
    "CAACAgIAAxUAAWqUbEElJocDr3_Dh520UPZTqMw6AALjAAOOZskFPpi6gLZaOSQ9BA",
    "CAACAgIAAxUAAWqUbEFDSEVjUqX2Wxt-3KMvf_xFAAI1AQACjmbJBU2M8LF-_iN0PQQ"
  ],
  "playful": [
    "CAACAgIAAxUAAWqUbAlcgEAzRnlotjNFwchW6qSVAAIaAAPANk8TgtuwtTwGQVc9BA",
    "CAACAgIAAxUAAWqUbAmgkAlv37vRIRFe9YWIZ2FsAAIeAAPANk8ToWBbLasAAd4EPQQ",
    "CAACAgIAAxUAAWqUbAmtINwjSR_bwO40sKLXuA7tAAJ7HAAC6NVQSVDYYIRiun3BPQQ",
    "CAACAgIAAxUAAWqUbBk93YAng9TZCK5udlKgp4jvAAIKAANlMwUlAAFAPd6vXvY7PQQ",
    "CAACAgIAAxUAAWqUbBkpyGdNGNgqnSMCi_XrkAXZAAIWAANlMwUlSfz1qsRDLNA9BA",
    "CAACAgIAAxUAAWqUbBkavk1hrKsQVbvckoyjHUWkAAIoAANlMwUlNZmLPAdOoyA9BA",
    "CAACAgQAAxUAAWqUbAqNW3BwGAZ7DulzGxjHcvY5AAKPGQACyMMBUmYdB8wUGggQPQQ",
    "CAACAgQAAxUAAWqUbApkFovFq228QPFUCXbCrfRKAAKYEwAC6ydYUqBnwNr3gx5OPQQ",
    "CAACAgQAAxUAAWqUbAqs66mMP9JLCqxRdaubfgABuwACehAAAt0IUVIlHeRsmA7Udz0E",
    "CAACAgQAAxUAAWqUbAof86Sg_0thCQv_6TcTVOzGAALGEAACAlxRUnQwK7FmeZgrPQQ"
  ],
  "funny": [
    "CAACAgIAAxUAAWqUbAli0eNvN6vZaNJGZaXFU43mAAIBAAPANk8TGC5zMKs_LVE9BA",
    "CAACAgIAAxUAAWqUbBmhFuRy9QU61VnVYEB4PDozAAIJAANlMwUlN6ghol0qVDc9BA",
    "CAACAgIAAxUAAWqUbBlBSYiDVs7lB3jLDxAygsg9AAINAANlMwUl7I1v5mjyvzs9BA",
    "CAACAgIAAxUAAWqUbBnT-XeKSLJnSr6pMs9aYSeVAAIeAANlMwUlyW9V2QlmTkc9BA",
    "CAACAgIAAxUAAWqUbBm4yeGsykrtwwZxyjbs8BIwAAIjAANlMwUlyBDkrzSY1x89BA",
    "CAACAgIAAxUAAWqUbBlcxVrmQ2NUUEY_1B0NoWjFAAImAANlMwUlv0S3KjeHems9BA",
    "CAACAgIAAxUAAWqUbBnipzu-fURC7SDlcR1OiCblAAIpAANlMwUlipfwuy2lFxg9BA",
    "CAACAgIAAxUAAWqUbBqbeEvVxeDr7oZPOnUmMhwaAALNDgACekFoSsNsPPK0sdbDPQQ",
    "CAACAgIAAxUAAWqUbBpC8JgDiqTgObr1ZQABb24L_wACfQoAApH4GUg6ON_NyQuLRz0E",
    "CAACAgIAAxUAAWqUbBpEO5LwIH4mzOtaFa4gsl2GAAK-DwAC9uTQSZ6MnpWN_CLyPQQ"
  ],
  "teasing": [
    "CAACAgIAAxUAAWqUbBnxkyr8h21oUf_k9Q3RJcSJAAIMAANlMwUlg-rWnn1tXWs9BA",
    "CAACAgIAAxUAAWqUbBnWA-7HzIh47uXYnzOJovp_AAIOAANlMwUlRxUpMXKYsnY9BA",
    "CAACAgIAAxUAAWqUbBpur_QpAAF11_SNTKgSxp8YqAACOQ0AAqef6UitbBViw4Y2Wz0E",
    "CAACAgIAAxUAAWqUbEFCBSN-d2-lVwOircHwdthOAAIjAQACjmbJBdvW05KjR0yOPQQ",
    "CAACAgIAAxUAAWqUbEHqTQLahOC3XdkiQ1ISvB3gAAIlAQACjmbJBaFz4QjvbVyuPQQ",
    "CAACAgIAAxUAAWqUbEEx1wgLXmUk88tXYtW4GwkSAAJjAQACjmbJBd35T20-mH9GPQQ",
    "CAACAgIAAxUAAWqUbEGOxsNimqHIef_R4O6YSRXXAAJxAQACjmbJBUAhuXXFTr2KPQQ",
    "CAACAgIAAxUAAWqUbEEIuo1fsvlV0FRYSG77IfF7AAKjAQACjmbJBXKnUfxxlzNhPQQ",
    "CAACAgIAAxUAAWqUbEGCqgTfCkLftUlVwBESBWRwAALjAQACjmbJBZcJGwqXrOtiPQQ",
    "CAACAgIAAxUAAWqUbEHJLxEDI_0tizDLZeRKq4ouAAJHAgACjmbJBZVz9vtWPHSXPQQ"
  ],
  "roasting": [
    "CAACAgIAAxUAAWqUbBpNjUNYro9zTwjAL8kf2xrlAAJ_DgACWsbpSocghU65OsAqPQQ",
    "CAACAgQAAxUAAWqUbArcEY2CejS2CUmNlNs04vNGAALNFgACTjIJUiPBHvr7PvZEPQQ",
    "CAACAgQAAxUAAWqUbAo_NQt6A7Wiquck2CCDTGxAAAKsFgACiRoJUulMZ5mIPQkcPQQ",
    "CAACAgQAAxUAAWqUbAokP3dxgovXGqaOBtULjb2CAAI0EQACG9FYUjKIqUFqEOsqPQQ",
    "CAACAgIAAxUAAWqUbAzwgSMxfaouJCwkQtQcLY5gAAJ4AAP3F4Er2R273jPcYpE9BA",
    "CAACAgIAAxUAAWqUbEEkAZYAAVMvM22WsbX0A1nyBAACDwEAAo5myQXMizCa7s5-AAE9BA",
    "CAACAgIAAxUAAWqUbEEKx9eDCqr3V9vDP0rtkG0QAAJVAQACjmbJBUcEGT2heXnmPQQ",
    "CAACAgIAAxUAAWqUbEG7YK8S3lorNUNbtPV30I5UAAKNAQACjmbJBaBAvw5I2i_SPQQ",
    "CAACAgIAAxUAAWqUbEE7Nb0JbRjjd1xrgIwdW6w0AAJJAgACjmbJBR7EwgYH7pSXPQQ",
    "CAACAgUAAxUAAWqUbEBJiwuo9oH4ZG4KwEisrhXGAALkAgACC7jhVkt6MQNjKgpKPQQ"
  ],
  "sarcastic": [
    "CAACAgIAAxUAAWqUbAkfC8TiB6ioa1IenvVA5RYvAAIdAAPANk8TXtim3EE93kg9BA",
    "CAACAgIAAxUAAWqUbAntotczvJqwzv0UYTnTyVLCAAIgAAPANk8T9A8ruj5f9M89BA",
    "CAACAgIAAxUAAWqUbBlrX4Z2UqtgJ0SLd9T1cFtjAAILAANlMwUl2WF8O5dWfNs9BA",
    "CAACAgIAAxUAAWqUbBnLjEwQy7lL9THW1svSMrERAAIPAANlMwUlIPOq6QeHBw09BA",
    "CAACAgIAAxUAAWqUbBkna5snRglG-iMregnBt7AqAAIVAANlMwUllEnKBbSEZBY9BA",
    "CAACAgIAAxUAAWqUbBnxkN5mrg98pAQ9AAEWC27bZwACJAADZTMFJSfijPfcgcVmPQQ",
    "CAACAgIAAxUAAWqUbBkvnptn7AN9GqcCkbKpmxRTAAIsAANlMwUlQzhiY5BmLLs9BA",
    "CAACAgIAAxUAAWqUbBlUP2zvJf4L6vXIKpi1kH8UAAItAANlMwUlsiU8EPmFlXI9BA",
    "CAACAgIAAxUAAWqUbBnbYcFdcxFEut84p4VCxJXSAAIuAANlMwUlSMlbZzB0PWU9BA",
    "CAACAgIAAxUAAWqUbBnDPiBvZicMDu1jfX3e9ZbQAAIyAANlMwUlGkc-3aZqyug9BA"
  ],
  "caring": [
    "CAACAgIAAxUAAWqUbAlp2t8YkgSoCnE2a4ZZt7lGAAIMAAPANk8T4s8j_8J3n7w9BA",
    "CAACAgIAAxUAAWqUbBptS2iUr5_9-uCG9KO1hoUkAAI3CwACrwfwSzl5_m0LUKJEPQQ",
    "CAACAgQAAxUAAWqUbAqhzZ8-NgSeB_m3zwUxIr5KAAJDDQAC8PWJUnX5J-hhBbxjPQQ",
    "CAACAgQAAxUAAWqUbAqZchqZvFSNZCryGk7M2HHuAAIDDgACkJCBUntGMksV0Vl4PQQ",
    "CAACAgIAAxUAAWqUbAyji29vhUQRPBvUXf25Iqs8AAJcAAP3F4Erruq_YVdNw0w9BA",
    "CAACAgIAAxUAAWqUbAyNsHwsjbpO_AxSU76UaNskAAJgAAP3F4Erk-0ItfyKoao9BA",
    "CAACAgIAAxUAAWqUbEFz2j6inv_Fq-3QzbqZ87a7AAJfAQACjmbJBdelXRtgfVlDPQQ",
    "CAACAgUAAxUAAWqUbEC8B4EIIXjtS98gUaTYfNPyAAIxAgACjcDhVnpiy4cY1ZBMPQQ",
    "CAACAgUAAxUAAWqUbED7dJNwRm8PrioME_t9pCVFAAK7AgACLmvZVu3NnWYz_KK-PQQ",
    "CAACAgUAAxUAAWqUbECCLiXBslAEWb1qbSfz0g1wAAJLAwACumzYVrGG9Kz23hFWPQQ"
  ],
  "loving": [
    "CAACAgIAAxUAAWqUbAnN5WD-YR_jp895cBUjY385AAICAAPANk8TCPVuRfqEp1k9BA",
    "CAACAgIAAxUAAWqUbAkIBJk-QKdY9uxasGMrN9hTAAIZAAPANk8T0EOA9iBXFEs9BA",
    "CAACAgIAAxUAAWqUbAmWV6CX1l7DZtUloPy3NSNiAAKfHgACOkkpSXXiamE21BzyPQQ",
    "CAACAgIAAxUAAWqUbBm1l8FS36O49KJUTiVVmFiMAAIqAANlMwUlAuOk-R-ilj49BA",
    "CAACAgIAAxUAAWqUbBnK_l-G6fobAeNdoFNBCNqJAAIxAANlMwUlVjDQcPH06ik9BA",
    "CAACAgIAAxUAAWqUbBrXD3JRNincMzDG1LB3MQ5aAAKtDgACMpPwSLWp20i2z0xpPQQ",
    "CAACAgQAAxUAAWqUbAptPfdv96jmR_pl67qdhdyOAAIVEgACw91YUoj3p57dxELgPQQ",
    "CAACAgQAAxUAAWqUbArYGlYUxlMllubDmmHcvpvYAAIpCwACmTuJUlj15Ez8yDNKPQQ",
    "CAACAgIAAxUAAWqUbAxp2EnEJAsNL6_CBR2_9MlnAAJ6AAP3F4Er9tXd-vn64JY9BA",
    "CAACAgIAAxUAAWqUbEEkBhMmHadjnejnQFdBz9YwAALfAAOOZskFsLFtuhgTawQ9BA"
  ],
  "romantic": [
    "CAACAgIAAxUAAWqUbBphQfaeOOke41JEFDKCyN1rAAJ1DwACHhXxS43nj1cwX8CfPQQ",
    "CAACAgQAAxUAAWqUbArjYnD291GsescSL3p0BTGOAALADwAC1KxZUrg3ptjPdqsePQQ",
    "CAACAgIAAxUAAWqUbEH4g5J0M_1xbgFrVyedmQAB-QACBwEAAo5myQXo4zI1ODTegj0E",
    "CAACAgIAAxUAAWqUbEG91895ShGRtARYuehn6sJNAAJzAQACjmbJBUvIJJL8RTTdPQQ",
    "CAACAgIAAxUAAWqUbEHSyZcoQFYO7u5W3_fl_S8sAALgAQACjmbJBbWCiSztM9PIPQQ",
    "CAACAgUAAxUAAWqUbEBeMqcX5llKvsZxx30bDBv_AAKPAgACP8LYVpdGhz5uCtRwPQQ",
    "CAACAgUAAxUAAWqUbEB2Ldp5m8wGdSfKulHbraYwAAKbAgACNPvhVjsHctKayucDPQQ",
    "CAACAgUAAxUAAWqUbEDCGVEvF2-68ZCa6QqipFJzAAIgBAACnL3hVgFJ9zFVC7vPPQQ",
    "CAACAgIAAxUAAWqUbEZchLKiVPfYShRjlYiDrG5mAAIoAgACygMGC8X2oz3sZe85PQQ",
    "CAACAgIAAxUAAWqUbEZU-z3Vat4bC4FduzTjppzpAAIjAgACygMGC0_vgJoksGJsPQQ"
  ],
  "flirty": [
    "CAACAgIAAxUAAWqUbAllYxAjJMPo5NsaKKXSbw1AAAIIAAPANk8Tb2wmC94am2k9BA",
    "CAACAgIAAxUAAWqUbAnpyPhg6SOJUx0J2_gTlsN-AAIRAAPANk8TDaqzD9wePuU9BA",
    "CAACAgIAAxUAAWqUbAmpTUVPFhYbCHNfDBLiuOh8AAINAAPANk8TpPnh9NR4jVM9BA",
    "CAACAgIAAxUAAWqUbBkEbRmCZz7ZkVBeFoTXH8NxAAITAANlMwUl6wLxvpK7Mlo9BA",
    "CAACAgIAAxUAAWqUbBlXsgyeKtwgbt1fp3LfadgXAAIgAANlMwUlainxN5SE6pg9BA",
    "CAACAgIAAxUAAWqUbAwO0OfWGHk88oM_omcQbdRQAAJ0AAP3F4EriXy2cQmWGB89BA",
    "CAACAgIAAxUAAWqUbEGXENu6fhGeF9wr9fGYknNUAAJtAQACjmbJBenpbm6hpNmpPQQ",
    "CAACAgIAAxUAAWqUbEFroT1UrygjorDRZG4bL_1HAAJPAgACjmbJBf6jrDGnEqoQPQQ",
    "CAACAgIAAxUAAWqUbENo4XVjDbza4EqIS1BXep0xAALDAAPUWkUBktqqvTFaEkY9BA",
    "CAACAgIAAxUAAWqUbEPnWH123FMjWyqctbpluQSFAALJAAPUWkUBXe5c8uYYbK49BA"
  ],
  "angry": [
    "CAACAgIAAxUAAWqUbBkiSRqL3WV2ppdYj-OcRJEsAAICAANlMwUl3yazlsu2btA9BA",
    "CAACAgIAAxUAAWqUbBmD_0r6qGuLg84POUZvdFVrAAIEAANlMwUlz378nD4JXy09BA",
    "CAACAgIAAxUAAWqUbBmOosxPX9GvWiMQ54JO0CFVAAIIAANlMwUlhDPGRsZXnaI9BA",
    "CAACAgIAAxUAAWqUbBl67XDVGvwswgYdhBd65XKKAAIQAANlMwUlTECunqvmnqY9BA",
    "CAACAgIAAxUAAWqUbBoE5LKyI4M3pQ9IArUrFBMJAAL6EQACScXwS4HOPbf8zzHePQQ",
    "CAACAgQAAxUAAWqUbApFntG3IjNsKOWQ27IdxKD9AALZDwACiT5RUotubo5BXO84PQQ",
    "CAACAgQAAxUAAWqUbAo8YY94DD8YkWYkQnhxgbpDAAJFEwACueNZUnaXXkVYKW_0PQQ",
    "CAACAgQAAxUAAWqUbArbxzghQc1w1VBs4kn3P1m-AAJdEQACxpFYUu5YfiQU4tUgPQQ",
    "CAACAgIAAxUAAWqUbAyk8MtxQMwSrmOudoMpMiWHAAJoAAP3F4Erg5t5Avx7raU9BA",
    "CAACAgIAAxUAAWqUbEEFyvMnyBr8JH9CcA8wxpXKAALlAAOOZskF63oOpY5azMs9BA"
  ],
  "sad": [
    "CAACAgIAAxUAAWqUbAkVNvI3y5-vTaAJhYm5KN_jAAIOAAPANk8TI1cURIdu1mU9BA",
    "CAACAgIAAxUAAWqUbBk-MMpi_ryn3xA1e8jD5gF-AAIFAANlMwUlD-MqxsG1n0w9BA",
    "CAACAgIAAxUAAWqUbBrw-_SZ6cdtxHS9mN0sDcQoAALyCQAC4PDwS3IoAmNGpJUpPQQ",
    "CAACAgIAAxUAAWqUbBpP9Bah24Fofy2VZ1vcpPqCAAIQEAACRy3pSFaUNkltws9OPQQ",
    "CAACAgIAAxUAAWqUbBrXXo0dYuxtsbprqOImwI_LAALNDwACuavpSl7RisMpubdnPQQ",
    "CAACAgQAAxUAAWqUbAqDAAEqXusZxS1WJZU-ZC1HEgAC_BAAAr1hWFJkoiHm5Ufihz0E",
    "CAACAgIAAxUAAWqUbAw3hbSnDZsgmtFw0q5-aYhSAAJmAAP3F4Er2r7QgDvhnL89BA",
    "CAACAgIAAxUAAWqUbAzX9gI2Cw-KzREkhLE2cHDyAAJsAAP3F4Er4aiqHt6gaCc9BA",
    "CAACAgIAAxUAAWqUbAyRs5KiqdM3J4NFxz_EFDPVAAJzAAP3F4Erh9CkfmJy_V09BA",
    "CAACAgIAAxUAAWqUbEEz0oCohwlDhEerCy8hP1i1AAL5AAOOZskFFdjP7Ima7nQ9BA"
  ],
  "gloomy": [
    "CAACAgIAAxUAAWqUbAnk5w7WATAlOCOpg-TkqtdMAAILAAPANk8TCPiv2Fk4yTM9BA",
    "CAACAgQAAxUAAWqUbAryuPznR24cwNmoRv7zFMchAALSEwACrxBYUtb5zBeouw8ePQQ",
    "CAACAgIAAxUAAWqUbAzwkJYvdf-nGXp2ukAFlPCjAAJjAAP3F4Er3hGUmVnXWAY9BA",
    "CAACAgIAAxUAAWqUbAyKuZWV2JoQynNDdJ4XwRyuAAJqAAP3F4ErSJ9oB4V_Kng9BA",
    "CAACAgIAAxUAAWqUbEGc4IvJNJ_HGI8EL1MOjq6nAAL9AAOOZskFechhWkNT3tA9BA",
    "CAACAgIAAxUAAWqUbEGp0A6KVVGPUQZAjk28QOcXAAJHAQACjmbJBVJl9rfj_CRMPQQ",
    "CAACAgIAAxUAAWqUbEF50vzZYMfSNENZiNNugEA2AAJPAQACjmbJBUMixRyz26bWPQQ",
    "CAACAgIAAxUAAWqUbEExUKYU8cK1nWj95zERZalgAAJRAQACjmbJBQaMzOz6QNvxPQQ",
    "CAACAgIAAxUAAWqUbEGFl5bCpnyz4IU2LGgUa9apAAKRAQACjmbJBYVfCF8fcOOLPQQ",
    "CAACAgIAAxUAAWqUbEHTIXj5Zj55LFTDKbNW10efAAKhAQACjmbJBaXdb07aJ6-xPQQ"
  ],
  "anxious": [
    "CAACAgIAAxUAAWqUbAmJ8-tvq5RezSw1Z01BWl4IAAIDAAPANk8TpCnu5n3zwHg9BA",
    "CAACAgIAAxUAAWqUbAkNuX4Wy5-CuXn63SsJBnH1AAIJAAPANk8T780bokr_cZU9BA",
    "CAACAgIAAxUAAWqUbAkX5rEb0a8ROW0TlJIaqeFmAAIfAAPANk8T5Dgz94RSmZI9BA",
    "CAACAgIAAxUAAWqUbBnfDnfhOcdxatE9n0RWD0qxAAIBAANlMwUl7_Ro4Y65dAQ9BA",
    "CAACAgIAAxUAAWqUbBl-fuWHLPQCOFLMMD9JQKzrAAIcAANlMwUlMJ_kMfmhwvg9BA",
    "CAACAgIAAxUAAWqUbBmwFLU9VNlutDUeAAGKL3ZjegACJwADZTMFJYS0G8YYpo8EPQQ",
    "CAACAgIAAxUAAWqUbBpsjPFAFvs9s3jnI9W3zAraAAK_DAACmF7ISHXkNITK6wihPQQ",
    "CAACAgIAAxUAAWqUbBrICjS7JpJpbynNQd9h2dTLAAJKEgAClCfQSWNzNm0YH8PyPQQ",
    "CAACAgIAAxUAAWqUbBp0z-JXf4miGWa3SiM8HlyoAAK9DwACyPfZSYv4yxFiNtBYPQQ",
    "CAACAgQAAxUAAWqUbAptelq26KPp_mn-87kvtgABiwACDBUAArddAVKkIDQXeITU1z0E"
  ],
  "peaceful": [
    "CAACAgIAAxUAAWqUbBnRYz5_aZ40K2LC0tEfsRQ5AAIhAANlMwUlTdBmUEOSGe89BA",
    "CAACAgIAAxUAAWqUbBkNZw8lon6ejrx5hyiWkEqRAAIlAANlMwUlsI-eO2XxtAU9BA",
    "CAACAgQAAxUAAWqUbAqVNIPhbdAvdpTyoRABT83GAALEEQACc-JYUsrjuF7R5OSBPQQ",
    "CAACAgQAAxUAAWqUbAqpnKb9o7TQf-Yu1Zhpy4JBAAKcEgAC1q-pUVjz3ZqE4CVQPQQ",
    "CAACAgQAAxUAAWqUbAqx_EMhOf-RPiy7vyWpbvRqAAIQEAACcTFZUusIZ0UBuKMUPQQ",
    "CAACAgIAAxUAAWqUbEEscxThg6Mc4Dc99nz_yw1JAAJNAQACjmbJBSs6JRmt9kNPPQQ",
    "CAACAgIAAxUAAWqUbENGi1gmimk8udioKtMvE2ulAAKIAgAC1FpFAU3nZUNIJe4mPQQ",
    "CAACAgIAAxUAAWqUbEYAAefLH8xtC4fsuvSUviKzYgACKgIAAsoDBgvFcFUZfX3bLz0E",
    "CAACAgIAAxUAAWqUbEZVsMn-4CtqyUGDYRbGlg2cAAItAgACygMGC9HrUeneGx_ZPQQ",
    "CAACAgEAAxUAAWqUbEWPX_z5VHcB58t_T0YxwhakAAJRAAOd9jsMuQrlDOCuUpo9BA"
  ],
  "surprised": [
    "CAACAgIAAxUAAWqUbAmtSpXg1gFNQAABQW-tFnUfegACBwADwDZPE0hhd1MIpyLHPQQ",
    "CAACAgIAAxUAAWqUbAchd03XTtJfxrrRF2aIHvrJAAJDAQAC9HsZAAEd5_BFZLHT8j0E",
    "CAACAgIAAxUAAWqUbBmz6xoPtz71cHIfSy--kMZQAAIYAANlMwUlaV_GTecp4lk9BA",
    "CAACAgIAAxUAAWqUbBnGfBmCPfn9P-QBph0uopqlAAIbAANlMwUlQezWtNDoWDY9BA",
    "CAACAgIAAxUAAWqUbBlSglAeJlfH5ddAq4E-olw6AAIdAANlMwUl1OHXMq_DXVY9BA",
    "CAACAgIAAxUAAWqUbBmcRVBrPmjfjKrDPYbjOMaFAAIvAANlMwUlPxfQvTo9tBI9BA",
    "CAACAgIAAxUAAWqUbBnUQgLmNm3VIANV8WsGb8RaAAIwAANlMwUlBzAAARmfyMz6PQQ",
    "CAACAgIAAxUAAWqUbAzGbnLC-Z-5sw8YKWuRfAAB4wACewAD9xeBK6qkHk1aOGawPQQ",
    "CAACAgIAAxUAAWqUbEHlNdgrwi9qgbjGjQRMa6IrAALxAAOOZskF6_InvMA3wqU9BA",
    "CAACAgIAAxUAAWqUbEHSmiX0MK83JmzN5nVuyio-AALzAAOOZskFls1bE6YXzlU9BA"
  ],
  "confused": [
    "CAACAgIAAxUAAWqUbAlKWrQksPCPjXfSYmpMjmfJAAISAAPANk8TM7yeAS6VBzc9BA",
    "CAACAgIAAxUAAWqUbAmuIF8S7ChWyc-ZnH7OSsYfAAIYAAPANk8T1vonv5xqGPg9BA",
    "CAACAgQAAxUAAWqUbB6BVzo0MQABhPi83fWTY5WFAwACKgUAApcVHAnbdNWNqvtfBD0E",
    "CAACAgQAAxUAAWqUbB7AWjQMQvyJZey0M7yEj0wbAAIsBQAClxUcCUzG-BAudkjSPQQ",
    "CAACAgQAAxUAAWqUbB7GBK9JraElNyVyy9dOqZaFAAIuBQAClxUcCUVhV0zYyRb1PQQ",
    "CAACAgQAAxUAAWqUbB7DCzxKuTyz9Opw8ktKqVDYAAIwBQAClxUcCcHQ_CY1vuj-PQQ",
    "CAACAgQAAxUAAWqUbB6ozqpBgCAYWzUY0trs1z3nAAIyBQAClxUcCXcid1N0v_wSPQQ",
    "CAACAgQAAxUAAWqUbB4nHb9NQNIxqjEEDZq7MKPiAAI0BQAClxUcCQl2MJIjYscLPQQ",
    "CAACAgQAAxUAAWqUbB71A5WXIFawWVUCOaldbbiUAAI2BQAClxUcCb21pE8TehlBPQQ",
    "CAACAgQAAxUAAWqUbB6-VLn71uVgPFwWel35LcQYAAI4BQAClxUcCSFTsd9Dh2JZPQQ"
  ],
  "grumpy": [
    "CAACAgIAAxUAAWqUbBp9VTc818RCj11Ld40Q7g_8AALSCwACgH2hS1JS7sVY9sr1PQQ",
    "CAACAgIAAxUAAWqUbEF_84p5Rrt5czfjKv-JPNZWAALvAAOOZskFgcQlK849rqU9BA",
    "CAACAgIAAxUAAWqUbEEZhAv0_FbabHK6QvjjZyrkAAIBAQACjmbJBaIF6p2zsnk2PQQ",
    "CAACAgIAAxUAAWqUbEH5pKoSBAXlKaoCCEHdTwc8AAILAQACjmbJBXvbiUiYRvwzPQQ",
    "CAACAgIAAxUAAWqUbEFDpPaoH8wgU8O1xtTF1wXKAAJnAQACjmbJBUoJnM8xkAoiPQQ",
    "CAACAgIAAxUAAWqUbEFc6LypmQimCr9q0vVf1y24AAKVAQACjmbJBTCFJgE534XzPQQ",
    "CAACAgIAAxUAAWqUbEG8jOjA9QG5DLn7xMiUekw2AAJGAgACjmbJBYYinRgwOBozPQQ",
    "CAACAgIAAxUAAWqUbEE2O2k2yopaXx_bKTzeo_hyAAJTAgACjmbJBbfUG5GQEdR9PQQ",
    "CAACAgUAAxUAAWqUbECI4AcjXchYb1o32ze6OHOuAAI2AwAC21LgVnOuuGNspjgNPQQ",
    "CAACAgUAAxUAAWqUbEA-yuCUBgnlaBcD4dsP-9XZAALvAQACISjgVjBSqowJyJYkPQQ"
  ],
  "joyful": [
    "CAACAgIAAxUAAWqUbBmfQc29jEp5iJ9os_2FasnlAAIHAANlMwUlG6XO5hWSvaM9BA",
    "CAACAgIAAxUAAWqUbBmpRDhPtGDyebq4V3PFOTlZAAIXAANlMwUlLlhsEL_2__09BA",
    "CAACAgIAAxUAAWqUbEHzuaLNsgYH4-J7IKpV62TfAAJbAQACjmbJBWgWdtEbaYlbPQQ",
    "CAACAgIAAxUAAWqUbEEjuCyPnnG9EWI5TG_VXYlhAAKdAQACjmbJBdFjLkLzk_T4PQQ",
    "CAACAgUAAxUAAWqUbEBMrAH5vnk8fZTGL1EvjjDdAAIhAwACHnvgVlix5HiKcvXgPQQ",
    "CAACAgUAAxUAAWqUbEB-OA5TqHvl70dczzHPv-TXAAKEAgACM_TgVqbdO5CGsc4DPQQ",
    "CAACAgUAAxUAAWqUbEDCpuE_4MXPK8CxXhVBP7oLAALvBQACnsPhVrqqDoAcq3JlPQQ",
    "CAACAgUAAxUAAWqUbEDzFUF9fpNLqwQM_69xxd8EAAJPAwACeJTZVm8qW3CWhbgKPQQ",
    "CAACAgUAAxUAAWqUbEDXM1c_YRC-TEUJR_7mc0NqAALdAgAC1YngVsZocKU1ML8ZPQQ",
    "CAACAgUAAxUAAWqUbEDHg-JbT1KL3lK03Wgki-ZRAALtBAACteDZVgOInPELu3i8PQQ"
  ]
};

export const DEFAULT_STICKER_METADATA: Record<string, DefaultStickerMeta> = {
  "CAACAgIAAxUAAWqUbAli0eNvN6vZaNJGZaXFU43mAAIBAAPANk8TGC5zMKs_LVE9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAli0eNvN6vZaNJGZaXFU43mAAIBAAPANk8TGC5zMKs_LVE9BA",
    "mood": "funny",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "😂"
  },
  "CAACAgIAAxUAAWqUbAnN5WD-YR_jp895cBUjY385AAICAAPANk8TCPVuRfqEp1k9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAnN5WD-YR_jp895cBUjY385AAICAAPANk8TCPVuRfqEp1k9BA",
    "mood": "loving",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "😘"
  },
  "CAACAgIAAxUAAWqUbAlZeyCFe_6hAAE41c2y_onefQACFQADwDZPE81WpjthnmTnPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbAlZeyCFe_6hAAE41c2y_onefQACFQADwDZPE81WpjthnmTnPQQ",
    "mood": "normal",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "👍"
  },
  "CAACAgIAAxUAAWqUbAmJ8-tvq5RezSw1Z01BWl4IAAIDAAPANk8TpCnu5n3zwHg9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAmJ8-tvq5RezSw1Z01BWl4IAAIDAAPANk8TpCnu5n3zwHg9BA",
    "mood": "anxious",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "😨"
  },
  "CAACAgIAAxUAAWqUbAmm0-cAAbEQuucFAyRtLK9MBAACBQADwDZPE_lqX5qCa011PQQ": {
    "fileId": "CAACAgIAAxUAAWqUbAmm0-cAAbEQuucFAyRtLK9MBAACBQADwDZPE_lqX5qCa011PQQ",
    "mood": "friendly",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "👋"
  },
  "CAACAgIAAxUAAWqUbAmtSpXg1gFNQAABQW-tFnUfegACBwADwDZPE0hhd1MIpyLHPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbAmtSpXg1gFNQAABQW-tFnUfegACBwADwDZPE0hhd1MIpyLHPQQ",
    "mood": "surprised",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "😧"
  },
  "CAACAgIAAxUAAWqUbAnsZkssmMHE1wnc2hf2QjIrAAITAAPANk8TqrOH9384yqU9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAnsZkssmMHE1wnc2hf2QjIrAAITAAPANk8TqrOH9384yqU9BA",
    "mood": "normal",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "👌"
  },
  "CAACAgIAAxUAAWqUbAllYxAjJMPo5NsaKKXSbw1AAAIIAAPANk8Tb2wmC94am2k9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAllYxAjJMPo5NsaKKXSbw1AAAIIAAPANk8Tb2wmC94am2k9BA",
    "mood": "flirty",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "🍑"
  },
  "CAACAgIAAxUAAWqUbAnpyPhg6SOJUx0J2_gTlsN-AAIRAAPANk8TDaqzD9wePuU9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAnpyPhg6SOJUx0J2_gTlsN-AAIRAAPANk8TDaqzD9wePuU9BA",
    "mood": "flirty",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "🤤"
  },
  "CAACAgIAAxUAAWqUbAkNuX4Wy5-CuXn63SsJBnH1AAIJAAPANk8T780bokr_cZU9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAkNuX4Wy5-CuXn63SsJBnH1AAIJAAPANk8T780bokr_cZU9BA",
    "mood": "anxious",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "😵"
  },
  "CAACAgIAAxUAAWqUbAljtldp3hXMxGXu0ajfqm2DAAIQAAPANk8T6oGKKfEfAug9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAljtldp3hXMxGXu0ajfqm2DAAIQAAPANk8T6oGKKfEfAug9BA",
    "mood": "normal",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "😐"
  },
  "CAACAgIAAxUAAWqUbAn3bnl5VAEIv1T1-zCL1s-1AAIKAAPANk8T_w2uPugO_Qg9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAn3bnl5VAEIv1T1-zCL1s-1AAIKAAPANk8T_w2uPugO_Qg9BA",
    "mood": "friendly",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "🤗"
  },
  "CAACAgIAAxUAAWqUbAnk5w7WATAlOCOpg-TkqtdMAAILAAPANk8TCPiv2Fk4yTM9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAnk5w7WATAlOCOpg-TkqtdMAAILAAPANk8TCPiv2Fk4yTM9BA",
    "mood": "gloomy",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "😴"
  },
  "CAACAgIAAxUAAWqUbAlKWrQksPCPjXfSYmpMjmfJAAISAAPANk8TM7yeAS6VBzc9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAlKWrQksPCPjXfSYmpMjmfJAAISAAPANk8TM7yeAS6VBzc9BA",
    "mood": "confused",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "❓"
  },
  "CAACAgIAAxUAAWqUbAlp2t8YkgSoCnE2a4ZZt7lGAAIMAAPANk8T4s8j_8J3n7w9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAlp2t8YkgSoCnE2a4ZZt7lGAAIMAAPANk8T4s8j_8J3n7w9BA",
    "mood": "caring",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "❤️"
  },
  "CAACAgIAAxUAAWqUbAmpTUVPFhYbCHNfDBLiuOh8AAINAAPANk8TpPnh9NR4jVM9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAmpTUVPFhYbCHNfDBLiuOh8AAINAAPANk8TpPnh9NR4jVM9BA",
    "mood": "flirty",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "😉"
  },
  "CAACAgIAAxUAAWqUbAkVNvI3y5-vTaAJhYm5KN_jAAIOAAPANk8TI1cURIdu1mU9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAkVNvI3y5-vTaAJhYm5KN_jAAIOAAPANk8TI1cURIdu1mU9BA",
    "mood": "sad",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "😭"
  },
  "CAACAgIAAxUAAWqUbAlJFpY6hqy15a9gy5UM3j2CAAIWAAPANk8TYCHXLaIEtmc9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAlJFpY6hqy15a9gy5UM3j2CAAIWAAPANk8TYCHXLaIEtmc9BA",
    "mood": "happy",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "😄"
  },
  "CAACAgIAAxUAAWqUbAmuIF8S7ChWyc-ZnH7OSsYfAAIYAAPANk8T1vonv5xqGPg9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAmuIF8S7ChWyc-ZnH7OSsYfAAIYAAPANk8T1vonv5xqGPg9BA",
    "mood": "confused",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "🤔"
  },
  "CAACAgIAAxUAAWqUbAkIBJk-QKdY9uxasGMrN9hTAAIZAAPANk8T0EOA9iBXFEs9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAkIBJk-QKdY9uxasGMrN9hTAAIZAAPANk8T0EOA9iBXFEs9BA",
    "mood": "loving",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "😍"
  },
  "CAACAgIAAxUAAWqUbAlcgEAzRnlotjNFwchW6qSVAAIaAAPANk8TgtuwtTwGQVc9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAlcgEAzRnlotjNFwchW6qSVAAIaAAPANk8TgtuwtTwGQVc9BA",
    "mood": "playful",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "😝"
  },
  "CAACAgIAAxUAAWqUbAn9RkB3qU9w07Nip3z23XHKAAIbAAPANk8Tfb2Kg8tETWo9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAn9RkB3qU9w07Nip3z23XHKAAIbAAPANk8Tfb2Kg8tETWo9BA",
    "mood": "happy",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "🥳"
  },
  "CAACAgIAAxUAAWqUbAkro-o85crg99KrOYSx2850AAIcAAPANk8TwYIa0yz-DuE9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAkro-o85crg99KrOYSx2850AAIcAAPANk8TwYIa0yz-DuE9BA",
    "mood": "happy",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "☺️"
  },
  "CAACAgIAAxUAAWqUbAkfC8TiB6ioa1IenvVA5RYvAAIdAAPANk8TXtim3EE93kg9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAkfC8TiB6ioa1IenvVA5RYvAAIdAAPANk8TXtim3EE93kg9BA",
    "mood": "sarcastic",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "👏"
  },
  "CAACAgIAAxUAAWqUbAmgkAlv37vRIRFe9YWIZ2FsAAIeAAPANk8ToWBbLasAAd4EPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbAmgkAlv37vRIRFe9YWIZ2FsAAIeAAPANk8ToWBbLasAAd4EPQQ",
    "mood": "playful",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "🍿"
  },
  "CAACAgIAAxUAAWqUbAkX5rEb0a8ROW0TlJIaqeFmAAIfAAPANk8T5Dgz94RSmZI9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAkX5rEb0a8ROW0TlJIaqeFmAAIfAAPANk8T5Dgz94RSmZI9BA",
    "mood": "anxious",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "😵"
  },
  "CAACAgIAAxUAAWqUbAntotczvJqwzv0UYTnTyVLCAAIgAAPANk8T9A8ruj5f9M89BA": {
    "fileId": "CAACAgIAAxUAAWqUbAntotczvJqwzv0UYTnTyVLCAAIgAAPANk8T9A8ruj5f9M89BA",
    "mood": "sarcastic",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "🙄"
  },
  "CAACAgIAAxUAAWqUbAms1eiRb5EclQABbjUjeflf4wAC6RsAAoV_EEnRch0GfnFH5z0E": {
    "fileId": "CAACAgIAAxUAAWqUbAms1eiRb5EclQABbjUjeflf4wAC6RsAAoV_EEnRch0GfnFH5z0E",
    "mood": "normal",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "👍"
  },
  "CAACAgIAAxUAAWqUbAmWV6CX1l7DZtUloPy3NSNiAAKfHgACOkkpSXXiamE21BzyPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbAmWV6CX1l7DZtUloPy3NSNiAAKfHgACOkkpSXXiamE21BzyPQQ",
    "mood": "loving",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "😘"
  },
  "CAACAgIAAxUAAWqUbAmtINwjSR_bwO40sKLXuA7tAAJ7HAAC6NVQSVDYYIRiun3BPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbAmtINwjSR_bwO40sKLXuA7tAAJ7HAAC6NVQSVDYYIRiun3BPQQ",
    "mood": "playful",
    "packName": "HotCherry",
    "packTitle": "Hot Cherry",
    "emoji": "💃"
  },
  "CAACAgIAAxUAAWqUbAe0vGtlEIU7woH6RG9cf-B2AALeAAP0exkAAb2F7273xc49PQQ": {
    "fileId": "CAACAgIAAxUAAWqUbAe0vGtlEIU7woH6RG9cf-B2AALeAAP0exkAAb2F7273xc49PQQ",
    "mood": "friendly",
    "packName": "Animals",
    "packTitle": "Just zoo it!",
    "emoji": "🐶"
  },
  "CAACAgIAAxUAAWqUbAf1hphbaniCXfZVmMOz70IdAAIEAQAC9HsZAAGAEeRAK8ac-z0E": {
    "fileId": "CAACAgIAAxUAAWqUbAf1hphbaniCXfZVmMOz70IdAAIEAQAC9HsZAAGAEeRAK8ac-z0E",
    "mood": "friendly",
    "packName": "Animals",
    "packTitle": "Just zoo it!",
    "emoji": "🐶"
  },
  "CAACAgIAAxUAAWqUbAc-kcJWgTzqZLZUSTOMO9BYAAILAQAC9HsZAAG4Cs7MocWO6z0E": {
    "fileId": "CAACAgIAAxUAAWqUbAc-kcJWgTzqZLZUSTOMO9BYAAILAQAC9HsZAAG4Cs7MocWO6z0E",
    "mood": "friendly",
    "packName": "Animals",
    "packTitle": "Just zoo it!",
    "emoji": "🐶"
  },
  "CAACAgIAAxUAAWqUbAcsoFXOCM3o5PPZ7BEnYCUrAAL-AAP0exkAAaAWf7umYeLZPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbAcsoFXOCM3o5PPZ7BEnYCUrAAL-AAP0exkAAaAWf7umYeLZPQQ",
    "mood": "friendly",
    "packName": "Animals",
    "packTitle": "Just zoo it!",
    "emoji": "🐶"
  },
  "CAACAgIAAxUAAWqUbAfBpV17dz62Mbd2-KD8VTKQAAIPAQAC9HsZAAFm9DkUA1TM9D0E": {
    "fileId": "CAACAgIAAxUAAWqUbAfBpV17dz62Mbd2-KD8VTKQAAIPAQAC9HsZAAFm9DkUA1TM9D0E",
    "mood": "friendly",
    "packName": "Animals",
    "packTitle": "Just zoo it!",
    "emoji": "🐶"
  },
  "CAACAgIAAxUAAWqUbAcoaDatde5uxDP2nP8zxFygAAI_AQAC9HsZAAFWKKg0qczYmj0E": {
    "fileId": "CAACAgIAAxUAAWqUbAcoaDatde5uxDP2nP8zxFygAAI_AQAC9HsZAAFWKKg0qczYmj0E",
    "mood": "happy",
    "packName": "Animals",
    "packTitle": "Just zoo it!",
    "emoji": "🎉"
  },
  "CAACAgIAAxUAAWqUbAdnoOSUGXw9rEZDiRbrokefAAJBAQAC9HsZAAFRWXXF49fe9z0E": {
    "fileId": "CAACAgIAAxUAAWqUbAdnoOSUGXw9rEZDiRbrokefAAJBAQAC9HsZAAFRWXXF49fe9z0E",
    "mood": "friendly",
    "packName": "Animals",
    "packTitle": "Just zoo it!",
    "emoji": "🐶"
  },
  "CAACAgIAAxUAAWqUbAcdwzlxhbaaLNyt_M920iF5AAJrAQAC9HsZAAGk_HvgqGvx8D0E": {
    "fileId": "CAACAgIAAxUAAWqUbAcdwzlxhbaaLNyt_M920iF5AAJrAQAC9HsZAAGk_HvgqGvx8D0E",
    "mood": "friendly",
    "packName": "Animals",
    "packTitle": "Just zoo it!",
    "emoji": "🐶"
  },
  "CAACAgIAAxUAAWqUbAc6TFZ_gQfSaiDoX8Atz2z-AALgAAP0exkAASzrKFdeleMwPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbAc6TFZ_gQfSaiDoX8Atz2z-AALgAAP0exkAASzrKFdeleMwPQQ",
    "mood": "normal",
    "packName": "Animals",
    "packTitle": "Just zoo it!",
    "emoji": "🐱"
  },
  "CAACAgIAAxUAAWqUbAekIolwiISG5wqRWmUX1V5xAAJoAQAC9HsZAAHwssSWsHaC_D0E": {
    "fileId": "CAACAgIAAxUAAWqUbAekIolwiISG5wqRWmUX1V5xAAJoAQAC9HsZAAHwssSWsHaC_D0E",
    "mood": "normal",
    "packName": "Animals",
    "packTitle": "Just zoo it!",
    "emoji": "🐱"
  },
  "CAACAgIAAxUAAWqUbAf4OnN-doWMvGUeBUtBRPaKAAMBAAL0exkAAfRksArkn456PQQ": {
    "fileId": "CAACAgIAAxUAAWqUbAf4OnN-doWMvGUeBUtBRPaKAAMBAAL0exkAAfRksArkn456PQQ",
    "mood": "normal",
    "packName": "Animals",
    "packTitle": "Just zoo it!",
    "emoji": "🐱"
  },
  "CAACAgIAAxUAAWqUbAfHeR3tmY0l9YC6v94-tI_vAAJkAQAC9HsZAAFn6aPvO59rLz0E": {
    "fileId": "CAACAgIAAxUAAWqUbAfHeR3tmY0l9YC6v94-tI_vAAJkAQAC9HsZAAFn6aPvO59rLz0E",
    "mood": "normal",
    "packName": "Animals",
    "packTitle": "Just zoo it!",
    "emoji": "🐱"
  },
  "CAACAgIAAxUAAWqUbAcdr_WvA3CRK5iNeezdX8IgAAJmAQAC9HsZAAHdZJKK6tGNzT0E": {
    "fileId": "CAACAgIAAxUAAWqUbAcdr_WvA3CRK5iNeezdX8IgAAJmAQAC9HsZAAHdZJKK6tGNzT0E",
    "mood": "normal",
    "packName": "Animals",
    "packTitle": "Just zoo it!",
    "emoji": "🐱"
  },
  "CAACAgIAAxUAAWqUbAdvERu1X9l428mfCkQuOAQFAAJJAQAC9HsZAAEOsNjpiID-Lz0E": {
    "fileId": "CAACAgIAAxUAAWqUbAdvERu1X9l428mfCkQuOAQFAAJJAQAC9HsZAAEOsNjpiID-Lz0E",
    "mood": "normal",
    "packName": "Animals",
    "packTitle": "Just zoo it!",
    "emoji": "🐱"
  },
  "CAACAgIAAxUAAWqUbAceZ_neVKQF9Vu6A5Q-OS4KAAL4AAP0exkAAQtRF3q3XTjpPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbAceZ_neVKQF9Vu6A5Q-OS4KAAL4AAP0exkAAQtRF3q3XTjpPQQ",
    "mood": "friendly",
    "packName": "Animals",
    "packTitle": "Just zoo it!",
    "emoji": "🐱"
  },
  "CAACAgIAAxUAAWqUbAf7dKDIux8s5WhfEeXnb8PPAAIRAQAC9HsZAAH1nz_2mMhZ0D0E": {
    "fileId": "CAACAgIAAxUAAWqUbAf7dKDIux8s5WhfEeXnb8PPAAIRAQAC9HsZAAH1nz_2mMhZ0D0E",
    "mood": "cute",
    "packName": "Animals",
    "packTitle": "Just zoo it!",
    "emoji": "🐱"
  },
  "CAACAgIAAxUAAWqUbAdWjoahJXA6AAHR3WfE7QcnHwAC_AAD9HsZAAGAROatrwevYz0E": {
    "fileId": "CAACAgIAAxUAAWqUbAdWjoahJXA6AAHR3WfE7QcnHwAC_AAD9HsZAAGAROatrwevYz0E",
    "mood": "cute",
    "packName": "Animals",
    "packTitle": "Just zoo it!",
    "emoji": "🐹"
  },
  "CAACAgIAAxUAAWqUbAfvuSi1HoGAV2xTwOeMAnmnAAINAQAC9HsZAAEnr4wIdn4X0D0E": {
    "fileId": "CAACAgIAAxUAAWqUbAfvuSi1HoGAV2xTwOeMAnmnAAINAQAC9HsZAAEnr4wIdn4X0D0E",
    "mood": "cute",
    "packName": "Animals",
    "packTitle": "Just zoo it!",
    "emoji": "🐼"
  },
  "CAACAgIAAxUAAWqUbAfxbO5gP_5QH89KmOnp7M3LAALqAAP0exkAAWOxd5rsdFPXPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbAfxbO5gP_5QH89KmOnp7M3LAALqAAP0exkAAWOxd5rsdFPXPQQ",
    "mood": "cute",
    "packName": "Animals",
    "packTitle": "Just zoo it!",
    "emoji": "🐻"
  },
  "CAACAgIAAxUAAWqUbAf_2OeRylZ1e4zIwYVdAzdKAALwAAP0exkAAS69_6O0CNR5PQQ": {
    "fileId": "CAACAgIAAxUAAWqUbAf_2OeRylZ1e4zIwYVdAzdKAALwAAP0exkAAS69_6O0CNR5PQQ",
    "mood": "cute",
    "packName": "Animals",
    "packTitle": "Just zoo it!",
    "emoji": "🐼"
  },
  "CAACAgIAAxUAAWqUbAep2haNklWTzDnFwLXzO4iKAAJYPwACnyTRSF1mf3wBKVfuPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbAep2haNklWTzDnFwLXzO4iKAAJYPwACnyTRSF1mf3wBKVfuPQQ",
    "mood": "cute",
    "packName": "Animals",
    "packTitle": "Just zoo it!",
    "emoji": "🐻‍❄️"
  },
  "CAACAgIAAxUAAWqUbAejdUJBvGoJi5LhU5i-jGu8AALmAAP0exkAASlj8t1kwrmbPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbAejdUJBvGoJi5LhU5i-jGu8AALmAAP0exkAASlj8t1kwrmbPQQ",
    "mood": "cute",
    "packName": "Animals",
    "packTitle": "Just zoo it!",
    "emoji": "🐨"
  },
  "CAACAgIAAxUAAWqUbAchd03XTtJfxrrRF2aIHvrJAAJDAQAC9HsZAAEd5_BFZLHT8j0E": {
    "fileId": "CAACAgIAAxUAAWqUbAchd03XTtJfxrrRF2aIHvrJAAJDAQAC9HsZAAEd5_BFZLHT8j0E",
    "mood": "surprised",
    "packName": "Animals",
    "packTitle": "Just zoo it!",
    "emoji": "👀"
  },
  "CAACAgQAAxUAAWqUbB6BVzo0MQABhPi83fWTY5WFAwACKgUAApcVHAnbdNWNqvtfBD0E": {
    "fileId": "CAACAgQAAxUAAWqUbB6BVzo0MQABhPi83fWTY5WFAwACKgUAApcVHAnbdNWNqvtfBD0E",
    "mood": "confused",
    "packName": "RomanticCouple",
    "packTitle": "Romantic Couple",
    "emoji": "🌀"
  },
  "CAACAgQAAxUAAWqUbB7AWjQMQvyJZey0M7yEj0wbAAIsBQAClxUcCUzG-BAudkjSPQQ": {
    "fileId": "CAACAgQAAxUAAWqUbB7AWjQMQvyJZey0M7yEj0wbAAIsBQAClxUcCUzG-BAudkjSPQQ",
    "mood": "confused",
    "packName": "RomanticCouple",
    "packTitle": "Romantic Couple",
    "emoji": "🌀"
  },
  "CAACAgQAAxUAAWqUbB7GBK9JraElNyVyy9dOqZaFAAIuBQAClxUcCUVhV0zYyRb1PQQ": {
    "fileId": "CAACAgQAAxUAAWqUbB7GBK9JraElNyVyy9dOqZaFAAIuBQAClxUcCUVhV0zYyRb1PQQ",
    "mood": "confused",
    "packName": "RomanticCouple",
    "packTitle": "Romantic Couple",
    "emoji": "🌀"
  },
  "CAACAgQAAxUAAWqUbB7DCzxKuTyz9Opw8ktKqVDYAAIwBQAClxUcCcHQ_CY1vuj-PQQ": {
    "fileId": "CAACAgQAAxUAAWqUbB7DCzxKuTyz9Opw8ktKqVDYAAIwBQAClxUcCcHQ_CY1vuj-PQQ",
    "mood": "confused",
    "packName": "RomanticCouple",
    "packTitle": "Romantic Couple",
    "emoji": "🌀"
  },
  "CAACAgQAAxUAAWqUbB6ozqpBgCAYWzUY0trs1z3nAAIyBQAClxUcCXcid1N0v_wSPQQ": {
    "fileId": "CAACAgQAAxUAAWqUbB6ozqpBgCAYWzUY0trs1z3nAAIyBQAClxUcCXcid1N0v_wSPQQ",
    "mood": "confused",
    "packName": "RomanticCouple",
    "packTitle": "Romantic Couple",
    "emoji": "🌀"
  },
  "CAACAgQAAxUAAWqUbB4nHb9NQNIxqjEEDZq7MKPiAAI0BQAClxUcCQl2MJIjYscLPQQ": {
    "fileId": "CAACAgQAAxUAAWqUbB4nHb9NQNIxqjEEDZq7MKPiAAI0BQAClxUcCQl2MJIjYscLPQQ",
    "mood": "confused",
    "packName": "RomanticCouple",
    "packTitle": "Romantic Couple",
    "emoji": "🌀"
  },
  "CAACAgQAAxUAAWqUbB71A5WXIFawWVUCOaldbbiUAAI2BQAClxUcCb21pE8TehlBPQQ": {
    "fileId": "CAACAgQAAxUAAWqUbB71A5WXIFawWVUCOaldbbiUAAI2BQAClxUcCb21pE8TehlBPQQ",
    "mood": "confused",
    "packName": "RomanticCouple",
    "packTitle": "Romantic Couple",
    "emoji": "🌀"
  },
  "CAACAgQAAxUAAWqUbB6-VLn71uVgPFwWel35LcQYAAI4BQAClxUcCSFTsd9Dh2JZPQQ": {
    "fileId": "CAACAgQAAxUAAWqUbB6-VLn71uVgPFwWel35LcQYAAI4BQAClxUcCSFTsd9Dh2JZPQQ",
    "mood": "confused",
    "packName": "RomanticCouple",
    "packTitle": "Romantic Couple",
    "emoji": "🌀"
  },
  "CAACAgIAAxUAAWqUbBnfDnfhOcdxatE9n0RWD0qxAAIBAANlMwUl7_Ro4Y65dAQ9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBnfDnfhOcdxatE9n0RWD0qxAAIBAANlMwUl7_Ro4Y65dAQ9BA",
    "mood": "anxious",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😬"
  },
  "CAACAgIAAxUAAWqUbBkiSRqL3WV2ppdYj-OcRJEsAAICAANlMwUl3yazlsu2btA9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBkiSRqL3WV2ppdYj-OcRJEsAAICAANlMwUl3yazlsu2btA9BA",
    "mood": "angry",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😤"
  },
  "CAACAgIAAxUAAWqUbBmD_0r6qGuLg84POUZvdFVrAAIEAANlMwUlz378nD4JXy09BA": {
    "fileId": "CAACAgIAAxUAAWqUbBmD_0r6qGuLg84POUZvdFVrAAIEAANlMwUlz378nD4JXy09BA",
    "mood": "angry",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😠"
  },
  "CAACAgIAAxUAAWqUbBk-MMpi_ryn3xA1e8jD5gF-AAIFAANlMwUlD-MqxsG1n0w9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBk-MMpi_ryn3xA1e8jD5gF-AAIFAANlMwUlD-MqxsG1n0w9BA",
    "mood": "sad",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😭"
  },
  "CAACAgIAAxUAAWqUbBmfQc29jEp5iJ9os_2FasnlAAIHAANlMwUlG6XO5hWSvaM9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBmfQc29jEp5iJ9os_2FasnlAAIHAANlMwUlG6XO5hWSvaM9BA",
    "mood": "joyful",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "🤩"
  },
  "CAACAgIAAxUAAWqUbBmOosxPX9GvWiMQ54JO0CFVAAIIAANlMwUlhDPGRsZXnaI9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBmOosxPX9GvWiMQ54JO0CFVAAIIAANlMwUlhDPGRsZXnaI9BA",
    "mood": "angry",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "🤬"
  },
  "CAACAgIAAxUAAWqUbBmhFuRy9QU61VnVYEB4PDozAAIJAANlMwUlN6ghol0qVDc9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBmhFuRy9QU61VnVYEB4PDozAAIJAANlMwUlN6ghol0qVDc9BA",
    "mood": "funny",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😂"
  },
  "CAACAgIAAxUAAWqUbBk93YAng9TZCK5udlKgp4jvAAIKAANlMwUlAAFAPd6vXvY7PQQ": {
    "fileId": "CAACAgIAAxUAAWqUbBk93YAng9TZCK5udlKgp4jvAAIKAANlMwUlAAFAPd6vXvY7PQQ",
    "mood": "playful",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😛"
  },
  "CAACAgIAAxUAAWqUbBlrX4Z2UqtgJ0SLd9T1cFtjAAILAANlMwUl2WF8O5dWfNs9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBlrX4Z2UqtgJ0SLd9T1cFtjAAILAANlMwUl2WF8O5dWfNs9BA",
    "mood": "sarcastic",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "🤨"
  },
  "CAACAgIAAxUAAWqUbBnxkyr8h21oUf_k9Q3RJcSJAAIMAANlMwUlg-rWnn1tXWs9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBnxkyr8h21oUf_k9Q3RJcSJAAIMAANlMwUlg-rWnn1tXWs9BA",
    "mood": "teasing",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "🙃"
  },
  "CAACAgIAAxUAAWqUbBlBSYiDVs7lB3jLDxAygsg9AAINAANlMwUl7I1v5mjyvzs9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBlBSYiDVs7lB3jLDxAygsg9AAINAANlMwUl7I1v5mjyvzs9BA",
    "mood": "funny",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "🤣"
  },
  "CAACAgIAAxUAAWqUbBnWA-7HzIh47uXYnzOJovp_AAIOAANlMwUlRxUpMXKYsnY9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBnWA-7HzIh47uXYnzOJovp_AAIOAANlMwUlRxUpMXKYsnY9BA",
    "mood": "teasing",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😏"
  },
  "CAACAgIAAxUAAWqUbBnLjEwQy7lL9THW1svSMrERAAIPAANlMwUlIPOq6QeHBw09BA": {
    "fileId": "CAACAgIAAxUAAWqUbBnLjEwQy7lL9THW1svSMrERAAIPAANlMwUlIPOq6QeHBw09BA",
    "mood": "sarcastic",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "🧐"
  },
  "CAACAgIAAxUAAWqUbBl67XDVGvwswgYdhBd65XKKAAIQAANlMwUlTECunqvmnqY9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBl67XDVGvwswgYdhBd65XKKAAIQAANlMwUlTECunqvmnqY9BA",
    "mood": "angry",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😡"
  },
  "CAACAgIAAxUAAWqUbBkEbRmCZz7ZkVBeFoTXH8NxAAITAANlMwUl6wLxvpK7Mlo9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBkEbRmCZz7ZkVBeFoTXH8NxAAITAANlMwUl6wLxvpK7Mlo9BA",
    "mood": "flirty",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "🤤"
  },
  "CAACAgIAAxUAAWqUbBkna5snRglG-iMregnBt7AqAAIVAANlMwUllEnKBbSEZBY9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBkna5snRglG-iMregnBt7AqAAIVAANlMwUllEnKBbSEZBY9BA",
    "mood": "sarcastic",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😒"
  },
  "CAACAgIAAxUAAWqUbBkpyGdNGNgqnSMCi_XrkAXZAAIWAANlMwUlSfz1qsRDLNA9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBkpyGdNGNgqnSMCi_XrkAXZAAIWAANlMwUlSfz1qsRDLNA9BA",
    "mood": "playful",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "🤪"
  },
  "CAACAgIAAxUAAWqUbBmpRDhPtGDyebq4V3PFOTlZAAIXAANlMwUlLlhsEL_2__09BA": {
    "fileId": "CAACAgIAAxUAAWqUbBmpRDhPtGDyebq4V3PFOTlZAAIXAANlMwUlLlhsEL_2__09BA",
    "mood": "joyful",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "🤩"
  },
  "CAACAgIAAxUAAWqUbBmz6xoPtz71cHIfSy--kMZQAAIYAANlMwUlaV_GTecp4lk9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBmz6xoPtz71cHIfSy--kMZQAAIYAANlMwUlaV_GTecp4lk9BA",
    "mood": "surprised",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😳"
  },
  "CAACAgIAAxUAAWqUbBnGfBmCPfn9P-QBph0uopqlAAIbAANlMwUlQezWtNDoWDY9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBnGfBmCPfn9P-QBph0uopqlAAIbAANlMwUlQezWtNDoWDY9BA",
    "mood": "surprised",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😳"
  },
  "CAACAgIAAxUAAWqUbBl-fuWHLPQCOFLMMD9JQKzrAAIcAANlMwUlMJ_kMfmhwvg9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBl-fuWHLPQCOFLMMD9JQKzrAAIcAANlMwUlMJ_kMfmhwvg9BA",
    "mood": "anxious",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😱"
  },
  "CAACAgIAAxUAAWqUbBlSglAeJlfH5ddAq4E-olw6AAIdAANlMwUl1OHXMq_DXVY9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBlSglAeJlfH5ddAq4E-olw6AAIdAANlMwUl1OHXMq_DXVY9BA",
    "mood": "surprised",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😳"
  },
  "CAACAgIAAxUAAWqUbBnT-XeKSLJnSr6pMs9aYSeVAAIeAANlMwUlyW9V2QlmTkc9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBnT-XeKSLJnSr6pMs9aYSeVAAIeAANlMwUlyW9V2QlmTkc9BA",
    "mood": "funny",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😆"
  },
  "CAACAgIAAxUAAWqUbBmupf6drljaD0rChKMBUqQQAAIfAANlMwUl23Ft-XL16wY9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBmupf6drljaD0rChKMBUqQQAAIfAANlMwUl23Ft-XL16wY9BA",
    "mood": "happy",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "☺️"
  },
  "CAACAgIAAxUAAWqUbBlXsgyeKtwgbt1fp3LfadgXAAIgAANlMwUlainxN5SE6pg9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBlXsgyeKtwgbt1fp3LfadgXAAIgAANlMwUlainxN5SE6pg9BA",
    "mood": "flirty",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😉"
  },
  "CAACAgIAAxUAAWqUbBnRYz5_aZ40K2LC0tEfsRQ5AAIhAANlMwUlTdBmUEOSGe89BA": {
    "fileId": "CAACAgIAAxUAAWqUbBnRYz5_aZ40K2LC0tEfsRQ5AAIhAANlMwUlTdBmUEOSGe89BA",
    "mood": "peaceful",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😌"
  },
  "CAACAgIAAxUAAWqUbBm4yeGsykrtwwZxyjbs8BIwAAIjAANlMwUlyBDkrzSY1x89BA": {
    "fileId": "CAACAgIAAxUAAWqUbBm4yeGsykrtwwZxyjbs8BIwAAIjAANlMwUlyBDkrzSY1x89BA",
    "mood": "funny",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "🤭"
  },
  "CAACAgIAAxUAAWqUbBnxkN5mrg98pAQ9AAEWC27bZwACJAADZTMFJSfijPfcgcVmPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbBnxkN5mrg98pAQ9AAEWC27bZwACJAADZTMFJSfijPfcgcVmPQQ",
    "mood": "sarcastic",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "🤨"
  },
  "CAACAgIAAxUAAWqUbBkNZw8lon6ejrx5hyiWkEqRAAIlAANlMwUlsI-eO2XxtAU9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBkNZw8lon6ejrx5hyiWkEqRAAIlAANlMwUlsI-eO2XxtAU9BA",
    "mood": "peaceful",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😌"
  },
  "CAACAgIAAxUAAWqUbBlcxVrmQ2NUUEY_1B0NoWjFAAImAANlMwUlv0S3KjeHems9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBlcxVrmQ2NUUEY_1B0NoWjFAAImAANlMwUlv0S3KjeHems9BA",
    "mood": "funny",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "🤣"
  },
  "CAACAgIAAxUAAWqUbBmwFLU9VNlutDUeAAGKL3ZjegACJwADZTMFJYS0G8YYpo8EPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbBmwFLU9VNlutDUeAAGKL3ZjegACJwADZTMFJYS0G8YYpo8EPQQ",
    "mood": "anxious",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😱"
  },
  "CAACAgIAAxUAAWqUbBkavk1hrKsQVbvckoyjHUWkAAIoAANlMwUlNZmLPAdOoyA9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBkavk1hrKsQVbvckoyjHUWkAAIoAANlMwUlNZmLPAdOoyA9BA",
    "mood": "playful",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "🤪"
  },
  "CAACAgIAAxUAAWqUbBnipzu-fURC7SDlcR1OiCblAAIpAANlMwUlipfwuy2lFxg9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBnipzu-fURC7SDlcR1OiCblAAIpAANlMwUlipfwuy2lFxg9BA",
    "mood": "funny",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😂"
  },
  "CAACAgIAAxUAAWqUbBm1l8FS36O49KJUTiVVmFiMAAIqAANlMwUlAuOk-R-ilj49BA": {
    "fileId": "CAACAgIAAxUAAWqUbBm1l8FS36O49KJUTiVVmFiMAAIqAANlMwUlAuOk-R-ilj49BA",
    "mood": "loving",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😘"
  },
  "CAACAgIAAxUAAWqUbBkvnptn7AN9GqcCkbKpmxRTAAIsAANlMwUlQzhiY5BmLLs9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBkvnptn7AN9GqcCkbKpmxRTAAIsAANlMwUlQzhiY5BmLLs9BA",
    "mood": "sarcastic",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "🤨"
  },
  "CAACAgIAAxUAAWqUbBlUP2zvJf4L6vXIKpi1kH8UAAItAANlMwUlsiU8EPmFlXI9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBlUP2zvJf4L6vXIKpi1kH8UAAItAANlMwUlsiU8EPmFlXI9BA",
    "mood": "sarcastic",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "🤨"
  },
  "CAACAgIAAxUAAWqUbBnbYcFdcxFEut84p4VCxJXSAAIuAANlMwUlSMlbZzB0PWU9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBnbYcFdcxFEut84p4VCxJXSAAIuAANlMwUlSMlbZzB0PWU9BA",
    "mood": "sarcastic",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "🤨"
  },
  "CAACAgIAAxUAAWqUbBmcRVBrPmjfjKrDPYbjOMaFAAIvAANlMwUlPxfQvTo9tBI9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBmcRVBrPmjfjKrDPYbjOMaFAAIvAANlMwUlPxfQvTo9tBI9BA",
    "mood": "surprised",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😳"
  },
  "CAACAgIAAxUAAWqUbBnUQgLmNm3VIANV8WsGb8RaAAIwAANlMwUlBzAAARmfyMz6PQQ": {
    "fileId": "CAACAgIAAxUAAWqUbBnUQgLmNm3VIANV8WsGb8RaAAIwAANlMwUlBzAAARmfyMz6PQQ",
    "mood": "surprised",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😳"
  },
  "CAACAgIAAxUAAWqUbBnK_l-G6fobAeNdoFNBCNqJAAIxAANlMwUlVjDQcPH06ik9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBnK_l-G6fobAeNdoFNBCNqJAAIxAANlMwUlVjDQcPH06ik9BA",
    "mood": "loving",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😍"
  },
  "CAACAgIAAxUAAWqUbBnDPiBvZicMDu1jfX3e9ZbQAAIyAANlMwUlGkc-3aZqyug9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBnDPiBvZicMDu1jfX3e9ZbQAAIyAANlMwUlGkc-3aZqyug9BA",
    "mood": "sarcastic",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "🤨"
  },
  "CAACAgIAAxUAAWqUbBkTb6rFa6IWEQttzI-e7Z5kAAI1AANlMwUl6SBx9KOxUhI9BA": {
    "fileId": "CAACAgIAAxUAAWqUbBkTb6rFa6IWEQttzI-e7Z5kAAI1AANlMwUl6SBx9KOxUhI9BA",
    "mood": "happy",
    "packName": "classic_memes",
    "packTitle": "Good ol' meme faces",
    "emoji": "😊"
  },
  "CAACAgIAAxUAAWqUbBqbeEvVxeDr7oZPOnUmMhwaAALNDgACekFoSsNsPPK0sdbDPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbBqbeEvVxeDr7oZPOnUmMhwaAALNDgACekFoSsNsPPK0sdbDPQQ",
    "mood": "funny",
    "packName": "Memes",
    "packTitle": "Classic Memes",
    "emoji": "🤣"
  },
  "CAACAgIAAxUAAWqUbBrXD3JRNincMzDG1LB3MQ5aAAKtDgACMpPwSLWp20i2z0xpPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbBrXD3JRNincMzDG1LB3MQ5aAAKtDgACMpPwSLWp20i2z0xpPQQ",
    "mood": "loving",
    "packName": "Memes",
    "packTitle": "Classic Memes",
    "emoji": "😘"
  },
  "CAACAgIAAxUAAWqUbBpsjPFAFvs9s3jnI9W3zAraAAK_DAACmF7ISHXkNITK6wihPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbBpsjPFAFvs9s3jnI9W3zAraAAK_DAACmF7ISHXkNITK6wihPQQ",
    "mood": "anxious",
    "packName": "Memes",
    "packTitle": "Classic Memes",
    "emoji": "😨"
  },
  "CAACAgIAAxUAAWqUbBoE5LKyI4M3pQ9IArUrFBMJAAL6EQACScXwS4HOPbf8zzHePQQ": {
    "fileId": "CAACAgIAAxUAAWqUbBoE5LKyI4M3pQ9IArUrFBMJAAL6EQACScXwS4HOPbf8zzHePQQ",
    "mood": "angry",
    "packName": "Memes",
    "packTitle": "Classic Memes",
    "emoji": "😡"
  },
  "CAACAgIAAxUAAWqUbBpNjUNYro9zTwjAL8kf2xrlAAJ_DgACWsbpSocghU65OsAqPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbBpNjUNYro9zTwjAL8kf2xrlAAJ_DgACWsbpSocghU65OsAqPQQ",
    "mood": "roasting",
    "packName": "Memes",
    "packTitle": "Classic Memes",
    "emoji": "🖕"
  },
  "CAACAgIAAxUAAWqUbBrw-_SZ6cdtxHS9mN0sDcQoAALyCQAC4PDwS3IoAmNGpJUpPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbBrw-_SZ6cdtxHS9mN0sDcQoAALyCQAC4PDwS3IoAmNGpJUpPQQ",
    "mood": "sad",
    "packName": "Memes",
    "packTitle": "Classic Memes",
    "emoji": "😭"
  },
  "CAACAgIAAxUAAWqUbBpur_QpAAF11_SNTKgSxp8YqAACOQ0AAqef6UitbBViw4Y2Wz0E": {
    "fileId": "CAACAgIAAxUAAWqUbBpur_QpAAF11_SNTKgSxp8YqAACOQ0AAqef6UitbBViw4Y2Wz0E",
    "mood": "teasing",
    "packName": "Memes",
    "packTitle": "Classic Memes",
    "emoji": "😏"
  },
  "CAACAgIAAxUAAWqUbBptS2iUr5_9-uCG9KO1hoUkAAI3CwACrwfwSzl5_m0LUKJEPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbBptS2iUr5_9-uCG9KO1hoUkAAI3CwACrwfwSzl5_m0LUKJEPQQ",
    "mood": "caring",
    "packName": "Memes",
    "packTitle": "Classic Memes",
    "emoji": "☕️"
  },
  "CAACAgIAAxUAAWqUbBphQfaeOOke41JEFDKCyN1rAAJ1DwACHhXxS43nj1cwX8CfPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbBphQfaeOOke41JEFDKCyN1rAAJ1DwACHhXxS43nj1cwX8CfPQQ",
    "mood": "romantic",
    "packName": "Memes",
    "packTitle": "Classic Memes",
    "emoji": "🍷"
  },
  "CAACAgIAAxUAAWqUbBpC8JgDiqTgObr1ZQABb24L_wACfQoAApH4GUg6ON_NyQuLRz0E": {
    "fileId": "CAACAgIAAxUAAWqUbBpC8JgDiqTgObr1ZQABb24L_wACfQoAApH4GUg6ON_NyQuLRz0E",
    "mood": "funny",
    "packName": "Memes",
    "packTitle": "Classic Memes",
    "emoji": "😆"
  },
  "CAACAgIAAxUAAWqUbBpP9Bah24Fofy2VZ1vcpPqCAAIQEAACRy3pSFaUNkltws9OPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbBpP9Bah24Fofy2VZ1vcpPqCAAIQEAACRy3pSFaUNkltws9OPQQ",
    "mood": "sad",
    "packName": "Memes",
    "packTitle": "Classic Memes",
    "emoji": "☹️"
  },
  "CAACAgIAAxUAAWqUbBrICjS7JpJpbynNQd9h2dTLAAJKEgAClCfQSWNzNm0YH8PyPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbBrICjS7JpJpbynNQd9h2dTLAAJKEgAClCfQSWNzNm0YH8PyPQQ",
    "mood": "anxious",
    "packName": "Memes",
    "packTitle": "Classic Memes",
    "emoji": "😵"
  },
  "CAACAgIAAxUAAWqUbBpEO5LwIH4mzOtaFa4gsl2GAAK-DwAC9uTQSZ6MnpWN_CLyPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbBpEO5LwIH4mzOtaFa4gsl2GAAK-DwAC9uTQSZ6MnpWN_CLyPQQ",
    "mood": "funny",
    "packName": "Memes",
    "packTitle": "Classic Memes",
    "emoji": "🤣"
  },
  "CAACAgIAAxUAAWqUbBp0z-JXf4miGWa3SiM8HlyoAAK9DwACyPfZSYv4yxFiNtBYPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbBp0z-JXf4miGWa3SiM8HlyoAAK9DwACyPfZSYv4yxFiNtBYPQQ",
    "mood": "anxious",
    "packName": "Memes",
    "packTitle": "Classic Memes",
    "emoji": "😬"
  },
  "CAACAgIAAxUAAWqUbBrBNVqdmDaQGlHve1CZIG3VAAIVDgACs7KhS4Mfio6jHlshPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbBrBNVqdmDaQGlHve1CZIG3VAAIVDgACs7KhS4Mfio6jHlshPQQ",
    "mood": "happy",
    "packName": "Memes",
    "packTitle": "Classic Memes",
    "emoji": "😄"
  },
  "CAACAgIAAxUAAWqUbBp9VTc818RCj11Ld40Q7g_8AALSCwACgH2hS1JS7sVY9sr1PQQ": {
    "fileId": "CAACAgIAAxUAAWqUbBp9VTc818RCj11Ld40Q7g_8AALSCwACgH2hS1JS7sVY9sr1PQQ",
    "mood": "grumpy",
    "packName": "Memes",
    "packTitle": "Classic Memes",
    "emoji": "🙄"
  },
  "CAACAgIAAxUAAWqUbBrXXo0dYuxtsbprqOImwI_LAALNDwACuavpSl7RisMpubdnPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbBrXXo0dYuxtsbprqOImwI_LAALNDwACuavpSl7RisMpubdnPQQ",
    "mood": "sad",
    "packName": "Memes",
    "packTitle": "Classic Memes",
    "emoji": "😭"
  },
  "CAACAgQAAxUAAWqUbAptPfdv96jmR_pl67qdhdyOAAIVEgACw91YUoj3p57dxELgPQQ": {
    "fileId": "CAACAgQAAxUAAWqUbAptPfdv96jmR_pl67qdhdyOAAIVEgACw91YUoj3p57dxELgPQQ",
    "mood": "loving",
    "packName": "PudgyPenguins",
    "packTitle": "@PudgyPenguins",
    "emoji": "💓"
  },
  "CAACAgQAAxUAAWqUbAqNW3BwGAZ7DulzGxjHcvY5AAKPGQACyMMBUmYdB8wUGggQPQQ": {
    "fileId": "CAACAgQAAxUAAWqUbAqNW3BwGAZ7DulzGxjHcvY5AAKPGQACyMMBUmYdB8wUGggQPQQ",
    "mood": "playful",
    "packName": "PudgyPenguins",
    "packTitle": "@PudgyPenguins",
    "emoji": "🍿"
  },
  "CAACAgQAAxUAAWqUbAptelq26KPp_mn-87kvtgABiwACDBUAArddAVKkIDQXeITU1z0E": {
    "fileId": "CAACAgQAAxUAAWqUbAptelq26KPp_mn-87kvtgABiwACDBUAArddAVKkIDQXeITU1z0E",
    "mood": "anxious",
    "packName": "PudgyPenguins",
    "packTitle": "@PudgyPenguins",
    "emoji": "😱"
  },
  "CAACAgQAAxUAAWqUbArcEY2CejS2CUmNlNs04vNGAALNFgACTjIJUiPBHvr7PvZEPQQ": {
    "fileId": "CAACAgQAAxUAAWqUbArcEY2CejS2CUmNlNs04vNGAALNFgACTjIJUiPBHvr7PvZEPQQ",
    "mood": "roasting",
    "packName": "PudgyPenguins",
    "packTitle": "@PudgyPenguins",
    "emoji": "😈"
  },
  "CAACAgQAAxUAAWqUbAo_NQt6A7Wiquck2CCDTGxAAAKsFgACiRoJUulMZ5mIPQkcPQQ": {
    "fileId": "CAACAgQAAxUAAWqUbAo_NQt6A7Wiquck2CCDTGxAAAKsFgACiRoJUulMZ5mIPQkcPQQ",
    "mood": "roasting",
    "packName": "PudgyPenguins",
    "packTitle": "@PudgyPenguins",
    "emoji": "😈"
  },
  "CAACAgQAAxUAAWqUbAqVNIPhbdAvdpTyoRABT83GAALEEQACc-JYUsrjuF7R5OSBPQQ": {
    "fileId": "CAACAgQAAxUAAWqUbAqVNIPhbdAvdpTyoRABT83GAALEEQACc-JYUsrjuF7R5OSBPQQ",
    "mood": "peaceful",
    "packName": "PudgyPenguins",
    "packTitle": "@PudgyPenguins",
    "emoji": "😌"
  },
  "CAACAgQAAxUAAWqUbAokP3dxgovXGqaOBtULjb2CAAI0EQACG9FYUjKIqUFqEOsqPQQ": {
    "fileId": "CAACAgQAAxUAAWqUbAokP3dxgovXGqaOBtULjb2CAAI0EQACG9FYUjKIqUFqEOsqPQQ",
    "mood": "roasting",
    "packName": "PudgyPenguins",
    "packTitle": "@PudgyPenguins",
    "emoji": "🔥"
  },
  "CAACAgQAAxUAAWqUbApkFovFq228QPFUCXbCrfRKAAKYEwAC6ydYUqBnwNr3gx5OPQQ": {
    "fileId": "CAACAgQAAxUAAWqUbApkFovFq228QPFUCXbCrfRKAAKYEwAC6ydYUqBnwNr3gx5OPQQ",
    "mood": "playful",
    "packName": "PudgyPenguins",
    "packTitle": "@PudgyPenguins",
    "emoji": "🍿"
  },
  "CAACAgQAAxUAAWqUbAryuPznR24cwNmoRv7zFMchAALSEwACrxBYUtb5zBeouw8ePQQ": {
    "fileId": "CAACAgQAAxUAAWqUbAryuPznR24cwNmoRv7zFMchAALSEwACrxBYUtb5zBeouw8ePQQ",
    "mood": "gloomy",
    "packName": "PudgyPenguins",
    "packTitle": "@PudgyPenguins",
    "emoji": "💤"
  },
  "CAACAgQAAxUAAWqUbAqpnKb9o7TQf-Yu1Zhpy4JBAAKcEgAC1q-pUVjz3ZqE4CVQPQQ": {
    "fileId": "CAACAgQAAxUAAWqUbAqpnKb9o7TQf-Yu1Zhpy4JBAAKcEgAC1q-pUVjz3ZqE4CVQPQQ",
    "mood": "peaceful",
    "packName": "PudgyPenguins",
    "packTitle": "@PudgyPenguins",
    "emoji": "🛋️"
  },
  "CAACAgQAAxUAAWqUbApFntG3IjNsKOWQ27IdxKD9AALZDwACiT5RUotubo5BXO84PQQ": {
    "fileId": "CAACAgQAAxUAAWqUbApFntG3IjNsKOWQ27IdxKD9AALZDwACiT5RUotubo5BXO84PQQ",
    "mood": "angry",
    "packName": "PudgyPenguins",
    "packTitle": "@PudgyPenguins",
    "emoji": "😡"
  },
  "CAACAgQAAxUAAWqUbAo8YY94DD8YkWYkQnhxgbpDAAJFEwACueNZUnaXXkVYKW_0PQQ": {
    "fileId": "CAACAgQAAxUAAWqUbAo8YY94DD8YkWYkQnhxgbpDAAJFEwACueNZUnaXXkVYKW_0PQQ",
    "mood": "angry",
    "packName": "PudgyPenguins",
    "packTitle": "@PudgyPenguins",
    "emoji": "👊"
  },
  "CAACAgQAAxUAAWqUbArYGlYUxlMllubDmmHcvpvYAAIpCwACmTuJUlj15Ez8yDNKPQQ": {
    "fileId": "CAACAgQAAxUAAWqUbArYGlYUxlMllubDmmHcvpvYAAIpCwACmTuJUlj15Ez8yDNKPQQ",
    "mood": "loving",
    "packName": "PudgyPenguins",
    "packTitle": "@PudgyPenguins",
    "emoji": "🧡"
  },
  "CAACAgQAAxUAAWqUbAqx_EMhOf-RPiy7vyWpbvRqAAIQEAACcTFZUusIZ0UBuKMUPQQ": {
    "fileId": "CAACAgQAAxUAAWqUbAqx_EMhOf-RPiy7vyWpbvRqAAIQEAACcTFZUusIZ0UBuKMUPQQ",
    "mood": "peaceful",
    "packName": "PudgyPenguins",
    "packTitle": "@PudgyPenguins",
    "emoji": "🏖️"
  },
  "CAACAgQAAxUAAWqUbAqs66mMP9JLCqxRdaubfgABuwACehAAAt0IUVIlHeRsmA7Udz0E": {
    "fileId": "CAACAgQAAxUAAWqUbAqs66mMP9JLCqxRdaubfgABuwACehAAAt0IUVIlHeRsmA7Udz0E",
    "mood": "playful",
    "packName": "PudgyPenguins",
    "packTitle": "@PudgyPenguins",
    "emoji": "🎮"
  },
  "CAACAgQAAxUAAWqUbAqhzZ8-NgSeB_m3zwUxIr5KAAJDDQAC8PWJUnX5J-hhBbxjPQQ": {
    "fileId": "CAACAgQAAxUAAWqUbAqhzZ8-NgSeB_m3zwUxIr5KAAJDDQAC8PWJUnX5J-hhBbxjPQQ",
    "mood": "caring",
    "packName": "PudgyPenguins",
    "packTitle": "@PudgyPenguins",
    "emoji": "🤝"
  },
  "CAACAgQAAxUAAWqUbAof86Sg_0thCQv_6TcTVOzGAALGEAACAlxRUnQwK7FmeZgrPQQ": {
    "fileId": "CAACAgQAAxUAAWqUbAof86Sg_0thCQv_6TcTVOzGAALGEAACAlxRUnQwK7FmeZgrPQQ",
    "mood": "playful",
    "packName": "PudgyPenguins",
    "packTitle": "@PudgyPenguins",
    "emoji": "🎸"
  },
  "CAACAgQAAxUAAWqUbAqZchqZvFSNZCryGk7M2HHuAAIDDgACkJCBUntGMksV0Vl4PQQ": {
    "fileId": "CAACAgQAAxUAAWqUbAqZchqZvFSNZCryGk7M2HHuAAIDDgACkJCBUntGMksV0Vl4PQQ",
    "mood": "caring",
    "packName": "PudgyPenguins",
    "packTitle": "@PudgyPenguins",
    "emoji": "☕"
  },
  "CAACAgQAAxUAAWqUbArjYnD291GsescSL3p0BTGOAALADwAC1KxZUrg3ptjPdqsePQQ": {
    "fileId": "CAACAgQAAxUAAWqUbArjYnD291GsescSL3p0BTGOAALADwAC1KxZUrg3ptjPdqsePQQ",
    "mood": "romantic",
    "packName": "PudgyPenguins",
    "packTitle": "@PudgyPenguins",
    "emoji": "🍷"
  },
  "CAACAgQAAxUAAWqUbArbxzghQc1w1VBs4kn3P1m-AAJdEQACxpFYUu5YfiQU4tUgPQQ": {
    "fileId": "CAACAgQAAxUAAWqUbArbxzghQc1w1VBs4kn3P1m-AAJdEQACxpFYUu5YfiQU4tUgPQQ",
    "mood": "angry",
    "packName": "PudgyPenguins",
    "packTitle": "@PudgyPenguins",
    "emoji": "😡"
  },
  "CAACAgQAAxUAAWqUbAqDAAEqXusZxS1WJZU-ZC1HEgAC_BAAAr1hWFJkoiHm5Ufihz0E": {
    "fileId": "CAACAgQAAxUAAWqUbAqDAAEqXusZxS1WJZU-ZC1HEgAC_BAAAr1hWFJkoiHm5Ufihz0E",
    "mood": "sad",
    "packName": "PudgyPenguins",
    "packTitle": "@PudgyPenguins",
    "emoji": "😢"
  },
  "CAACAgIAAxUAAWqUbAxp2EnEJAsNL6_CBR2_9MlnAAJ6AAP3F4Er9tXd-vn64JY9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAxp2EnEJAsNL6_CBR2_9MlnAAJ6AAP3F4Er9tXd-vn64JY9BA",
    "mood": "loving",
    "packName": "Blobfish",
    "packTitle": "Blobfish",
    "emoji": "😘"
  },
  "CAACAgIAAxUAAWqUbAyNvQcnT9qONvL7SJk_Ze1AAAJvAAP3F4Er4slXqHY6fF89BA": {
    "fileId": "CAACAgIAAxUAAWqUbAyNvQcnT9qONvL7SJk_Ze1AAAJvAAP3F4Er4slXqHY6fF89BA",
    "mood": "happy",
    "packName": "Blobfish",
    "packTitle": "Blobfish",
    "emoji": "☺️"
  },
  "CAACAgIAAxUAAWqUbAyji29vhUQRPBvUXf25Iqs8AAJcAAP3F4Erruq_YVdNw0w9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAyji29vhUQRPBvUXf25Iqs8AAJcAAP3F4Erruq_YVdNw0w9BA",
    "mood": "caring",
    "packName": "Blobfish",
    "packTitle": "Blobfish",
    "emoji": "❤️"
  },
  "CAACAgIAAxUAAWqUbAyNsHwsjbpO_AxSU76UaNskAAJgAAP3F4Erk-0ItfyKoao9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAyNsHwsjbpO_AxSU76UaNskAAJgAAP3F4Erk-0ItfyKoao9BA",
    "mood": "caring",
    "packName": "Blobfish",
    "packTitle": "Blobfish",
    "emoji": "☕️"
  },
  "CAACAgIAAxUAAWqUbAzwkJYvdf-nGXp2ukAFlPCjAAJjAAP3F4Er3hGUmVnXWAY9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAzwkJYvdf-nGXp2ukAFlPCjAAJjAAP3F4Er3hGUmVnXWAY9BA",
    "mood": "gloomy",
    "packName": "Blobfish",
    "packTitle": "Blobfish",
    "emoji": "😪"
  },
  "CAACAgIAAxUAAWqUbAw3hbSnDZsgmtFw0q5-aYhSAAJmAAP3F4Er2r7QgDvhnL89BA": {
    "fileId": "CAACAgIAAxUAAWqUbAw3hbSnDZsgmtFw0q5-aYhSAAJmAAP3F4Er2r7QgDvhnL89BA",
    "mood": "sad",
    "packName": "Blobfish",
    "packTitle": "Blobfish",
    "emoji": "😢"
  },
  "CAACAgIAAxUAAWqUbAyk8MtxQMwSrmOudoMpMiWHAAJoAAP3F4Erg5t5Avx7raU9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAyk8MtxQMwSrmOudoMpMiWHAAJoAAP3F4Erg5t5Avx7raU9BA",
    "mood": "angry",
    "packName": "Blobfish",
    "packTitle": "Blobfish",
    "emoji": "😠"
  },
  "CAACAgIAAxUAAWqUbAyKuZWV2JoQynNDdJ4XwRyuAAJqAAP3F4ErSJ9oB4V_Kng9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAyKuZWV2JoQynNDdJ4XwRyuAAJqAAP3F4ErSJ9oB4V_Kng9BA",
    "mood": "gloomy",
    "packName": "Blobfish",
    "packTitle": "Blobfish",
    "emoji": "😴"
  },
  "CAACAgIAAxUAAWqUbAzX9gI2Cw-KzREkhLE2cHDyAAJsAAP3F4Er4aiqHt6gaCc9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAzX9gI2Cw-KzREkhLE2cHDyAAJsAAP3F4Er4aiqHt6gaCc9BA",
    "mood": "sad",
    "packName": "Blobfish",
    "packTitle": "Blobfish",
    "emoji": "😞"
  },
  "CAACAgIAAxUAAWqUbAyRs5KiqdM3J4NFxz_EFDPVAAJzAAP3F4Erh9CkfmJy_V09BA": {
    "fileId": "CAACAgIAAxUAAWqUbAyRs5KiqdM3J4NFxz_EFDPVAAJzAAP3F4Erh9CkfmJy_V09BA",
    "mood": "sad",
    "packName": "Blobfish",
    "packTitle": "Blobfish",
    "emoji": "😭"
  },
  "CAACAgIAAxUAAWqUbAwO0OfWGHk88oM_omcQbdRQAAJ0AAP3F4EriXy2cQmWGB89BA": {
    "fileId": "CAACAgIAAxUAAWqUbAwO0OfWGHk88oM_omcQbdRQAAJ0AAP3F4EriXy2cQmWGB89BA",
    "mood": "flirty",
    "packName": "Blobfish",
    "packTitle": "Blobfish",
    "emoji": "🤤"
  },
  "CAACAgIAAxUAAWqUbAzwgSMxfaouJCwkQtQcLY5gAAJ4AAP3F4Er2R273jPcYpE9BA": {
    "fileId": "CAACAgIAAxUAAWqUbAzwgSMxfaouJCwkQtQcLY5gAAJ4AAP3F4Er2R273jPcYpE9BA",
    "mood": "roasting",
    "packName": "Blobfish",
    "packTitle": "Blobfish",
    "emoji": "😈"
  },
  "CAACAgIAAxUAAWqUbAzGbnLC-Z-5sw8YKWuRfAAB4wACewAD9xeBK6qkHk1aOGawPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbAzGbnLC-Z-5sw8YKWuRfAAB4wACewAD9xeBK6qkHk1aOGawPQQ",
    "mood": "surprised",
    "packName": "Blobfish",
    "packTitle": "Blobfish",
    "emoji": "😱"
  },
  "CAACAgIAAxUAAWqUbEEkBhMmHadjnejnQFdBz9YwAALfAAOOZskFsLFtuhgTawQ9BA": {
    "fileId": "CAACAgIAAxUAAWqUbEEkBhMmHadjnejnQFdBz9YwAALfAAOOZskFsLFtuhgTawQ9BA",
    "mood": "loving",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😍"
  },
  "CAACAgIAAxUAAWqUbEElJocDr3_Dh520UPZTqMw6AALjAAOOZskFPpi6gLZaOSQ9BA": {
    "fileId": "CAACAgIAAxUAAWqUbEElJocDr3_Dh520UPZTqMw6AALjAAOOZskFPpi6gLZaOSQ9BA",
    "mood": "happy",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😊"
  },
  "CAACAgIAAxUAAWqUbEEFyvMnyBr8JH9CcA8wxpXKAALlAAOOZskF63oOpY5azMs9BA": {
    "fileId": "CAACAgIAAxUAAWqUbEEFyvMnyBr8JH9CcA8wxpXKAALlAAOOZskF63oOpY5azMs9BA",
    "mood": "angry",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😡"
  },
  "CAACAgIAAxUAAWqUbEF_84p5Rrt5czfjKv-JPNZWAALvAAOOZskFgcQlK849rqU9BA": {
    "fileId": "CAACAgIAAxUAAWqUbEF_84p5Rrt5czfjKv-JPNZWAALvAAOOZskFgcQlK849rqU9BA",
    "mood": "grumpy",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😠"
  },
  "CAACAgIAAxUAAWqUbEHlNdgrwi9qgbjGjQRMa6IrAALxAAOOZskF6_InvMA3wqU9BA": {
    "fileId": "CAACAgIAAxUAAWqUbEHlNdgrwi9qgbjGjQRMa6IrAALxAAOOZskF6_InvMA3wqU9BA",
    "mood": "surprised",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😧"
  },
  "CAACAgIAAxUAAWqUbEHSmiX0MK83JmzN5nVuyio-AALzAAOOZskFls1bE6YXzlU9BA": {
    "fileId": "CAACAgIAAxUAAWqUbEHSmiX0MK83JmzN5nVuyio-AALzAAOOZskFls1bE6YXzlU9BA",
    "mood": "surprised",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😲"
  },
  "CAACAgIAAxUAAWqUbEEz0oCohwlDhEerCy8hP1i1AAL5AAOOZskFFdjP7Ima7nQ9BA": {
    "fileId": "CAACAgIAAxUAAWqUbEEz0oCohwlDhEerCy8hP1i1AAL5AAOOZskFFdjP7Ima7nQ9BA",
    "mood": "sad",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😢"
  },
  "CAACAgIAAxUAAWqUbEGc4IvJNJ_HGI8EL1MOjq6nAAL9AAOOZskFechhWkNT3tA9BA": {
    "fileId": "CAACAgIAAxUAAWqUbEGc4IvJNJ_HGI8EL1MOjq6nAAL9AAOOZskFechhWkNT3tA9BA",
    "mood": "gloomy",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😞"
  },
  "CAACAgIAAxUAAWqUbEEZhAv0_FbabHK6QvjjZyrkAAIBAQACjmbJBaIF6p2zsnk2PQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEEZhAv0_FbabHK6QvjjZyrkAAIBAQACjmbJBaIF6p2zsnk2PQQ",
    "mood": "grumpy",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😑"
  },
  "CAACAgIAAxUAAWqUbEH4g5J0M_1xbgFrVyedmQAB-QACBwEAAo5myQXo4zI1ODTegj0E": {
    "fileId": "CAACAgIAAxUAAWqUbEH4g5J0M_1xbgFrVyedmQAB-QACBwEAAo5myQXo4zI1ODTegj0E",
    "mood": "romantic",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😘"
  },
  "CAACAgIAAxUAAWqUbEH5pKoSBAXlKaoCCEHdTwc8AAILAQACjmbJBXvbiUiYRvwzPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEH5pKoSBAXlKaoCCEHdTwc8AAILAQACjmbJBXvbiUiYRvwzPQQ",
    "mood": "grumpy",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😤"
  },
  "CAACAgIAAxUAAWqUbEEkAZYAAVMvM22WsbX0A1nyBAACDwEAAo5myQXMizCa7s5-AAE9BA": {
    "fileId": "CAACAgIAAxUAAWqUbEEkAZYAAVMvM22WsbX0A1nyBAACDwEAAo5myQXMizCa7s5-AAE9BA",
    "mood": "roasting",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "👎"
  },
  "CAACAgIAAxUAAWqUbEHrO5N3HC0H-LIk_deV_fGcAAIRAQACjmbJBXwrfTJV8iJcPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEHrO5N3HC0H-LIk_deV_fGcAAIRAQACjmbJBXwrfTJV8iJcPQQ",
    "mood": "cute",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "💖"
  },
  "CAACAgIAAxUAAWqUbEFCBSN-d2-lVwOircHwdthOAAIjAQACjmbJBdvW05KjR0yOPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEFCBSN-d2-lVwOircHwdthOAAIjAQACjmbJBdvW05KjR0yOPQQ",
    "mood": "teasing",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😝"
  },
  "CAACAgIAAxUAAWqUbEHqTQLahOC3XdkiQ1ISvB3gAAIlAQACjmbJBaFz4QjvbVyuPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEHqTQLahOC3XdkiQ1ISvB3gAAIlAQACjmbJBaFz4QjvbVyuPQQ",
    "mood": "teasing",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😜"
  },
  "CAACAgIAAxUAAWqUbEFDSEVjUqX2Wxt-3KMvf_xFAAI1AQACjmbJBU2M8LF-_iN0PQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEFDSEVjUqX2Wxt-3KMvf_xFAAI1AQACjmbJBU2M8LF-_iN0PQQ",
    "mood": "happy",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😁"
  },
  "CAACAgIAAxUAAWqUbEGp0A6KVVGPUQZAjk28QOcXAAJHAQACjmbJBVJl9rfj_CRMPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEGp0A6KVVGPUQZAjk28QOcXAAJHAQACjmbJBVJl9rfj_CRMPQQ",
    "mood": "gloomy",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😔"
  },
  "CAACAgIAAxUAAWqUbEEscxThg6Mc4Dc99nz_yw1JAAJNAQACjmbJBSs6JRmt9kNPPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEEscxThg6Mc4Dc99nz_yw1JAAJNAQACjmbJBSs6JRmt9kNPPQQ",
    "mood": "peaceful",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😌"
  },
  "CAACAgIAAxUAAWqUbEF50vzZYMfSNENZiNNugEA2AAJPAQACjmbJBUMixRyz26bWPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEF50vzZYMfSNENZiNNugEA2AAJPAQACjmbJBUMixRyz26bWPQQ",
    "mood": "gloomy",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😴"
  },
  "CAACAgIAAxUAAWqUbEExUKYU8cK1nWj95zERZalgAAJRAQACjmbJBQaMzOz6QNvxPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEExUKYU8cK1nWj95zERZalgAAJRAQACjmbJBQaMzOz6QNvxPQQ",
    "mood": "gloomy",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😪"
  },
  "CAACAgIAAxUAAWqUbEEKx9eDCqr3V9vDP0rtkG0QAAJVAQACjmbJBUcEGT2heXnmPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEEKx9eDCqr3V9vDP0rtkG0QAAJVAQACjmbJBUcEGT2heXnmPQQ",
    "mood": "roasting",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😈"
  },
  "CAACAgIAAxUAAWqUbEHzuaLNsgYH4-J7IKpV62TfAAJbAQACjmbJBWgWdtEbaYlbPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEHzuaLNsgYH4-J7IKpV62TfAAJbAQACjmbJBWgWdtEbaYlbPQQ",
    "mood": "joyful",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😄"
  },
  "CAACAgIAAxUAAWqUbEFz2j6inv_Fq-3QzbqZ87a7AAJfAQACjmbJBdelXRtgfVlDPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEFz2j6inv_Fq-3QzbqZ87a7AAJfAQACjmbJBdelXRtgfVlDPQQ",
    "mood": "caring",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😊"
  },
  "CAACAgIAAxUAAWqUbEEx1wgLXmUk88tXYtW4GwkSAAJjAQACjmbJBd35T20-mH9GPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEEx1wgLXmUk88tXYtW4GwkSAAJjAQACjmbJBd35T20-mH9GPQQ",
    "mood": "teasing",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😏"
  },
  "CAACAgIAAxUAAWqUbEFDpPaoH8wgU8O1xtTF1wXKAAJnAQACjmbJBUoJnM8xkAoiPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEFDpPaoH8wgU8O1xtTF1wXKAAJnAQACjmbJBUoJnM8xkAoiPQQ",
    "mood": "grumpy",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😒"
  },
  "CAACAgIAAxUAAWqUbEGXENu6fhGeF9wr9fGYknNUAAJtAQACjmbJBenpbm6hpNmpPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEGXENu6fhGeF9wr9fGYknNUAAJtAQACjmbJBenpbm6hpNmpPQQ",
    "mood": "flirty",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😉"
  },
  "CAACAgIAAxUAAWqUbEGOxsNimqHIef_R4O6YSRXXAAJxAQACjmbJBUAhuXXFTr2KPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEGOxsNimqHIef_R4O6YSRXXAAJxAQACjmbJBUAhuXXFTr2KPQQ",
    "mood": "teasing",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😜"
  },
  "CAACAgIAAxUAAWqUbEG91895ShGRtARYuehn6sJNAAJzAQACjmbJBUvIJJL8RTTdPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEG91895ShGRtARYuehn6sJNAAJzAQACjmbJBUvIJJL8RTTdPQQ",
    "mood": "romantic",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😘"
  },
  "CAACAgIAAxUAAWqUbEG7YK8S3lorNUNbtPV30I5UAAKNAQACjmbJBaBAvw5I2i_SPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEG7YK8S3lorNUNbtPV30I5UAAKNAQACjmbJBaBAvw5I2i_SPQQ",
    "mood": "roasting",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😈"
  },
  "CAACAgIAAxUAAWqUbEGFl5bCpnyz4IU2LGgUa9apAAKRAQACjmbJBYVfCF8fcOOLPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEGFl5bCpnyz4IU2LGgUa9apAAKRAQACjmbJBYVfCF8fcOOLPQQ",
    "mood": "gloomy",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😔"
  },
  "CAACAgIAAxUAAWqUbEFc6LypmQimCr9q0vVf1y24AAKVAQACjmbJBTCFJgE534XzPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEFc6LypmQimCr9q0vVf1y24AAKVAQACjmbJBTCFJgE534XzPQQ",
    "mood": "grumpy",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😑"
  },
  "CAACAgIAAxUAAWqUbEEjuCyPnnG9EWI5TG_VXYlhAAKdAQACjmbJBdFjLkLzk_T4PQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEEjuCyPnnG9EWI5TG_VXYlhAAKdAQACjmbJBdFjLkLzk_T4PQQ",
    "mood": "joyful",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "🙌"
  },
  "CAACAgIAAxUAAWqUbEHTIXj5Zj55LFTDKbNW10efAAKhAQACjmbJBaXdb07aJ6-xPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEHTIXj5Zj55LFTDKbNW10efAAKhAQACjmbJBaXdb07aJ6-xPQQ",
    "mood": "gloomy",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😔"
  },
  "CAACAgIAAxUAAWqUbEEIuo1fsvlV0FRYSG77IfF7AAKjAQACjmbJBXKnUfxxlzNhPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEEIuo1fsvlV0FRYSG77IfF7AAKjAQACjmbJBXKnUfxxlzNhPQQ",
    "mood": "teasing",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😜"
  },
  "CAACAgIAAxUAAWqUbEHSyZcoQFYO7u5W3_fl_S8sAALgAQACjmbJBbWCiSztM9PIPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEHSyZcoQFYO7u5W3_fl_S8sAALgAQACjmbJBbWCiSztM9PIPQQ",
    "mood": "romantic",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😘"
  },
  "CAACAgIAAxUAAWqUbEGCqgTfCkLftUlVwBESBWRwAALjAQACjmbJBZcJGwqXrOtiPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEGCqgTfCkLftUlVwBESBWRwAALjAQACjmbJBZcJGwqXrOtiPQQ",
    "mood": "teasing",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😜"
  },
  "CAACAgIAAxUAAWqUbEG8jOjA9QG5DLn7xMiUekw2AAJGAgACjmbJBYYinRgwOBozPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEG8jOjA9QG5DLn7xMiUekw2AAJGAgACjmbJBYYinRgwOBozPQQ",
    "mood": "grumpy",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😠"
  },
  "CAACAgIAAxUAAWqUbEHJLxEDI_0tizDLZeRKq4ouAAJHAgACjmbJBZVz9vtWPHSXPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEHJLxEDI_0tizDLZeRKq4ouAAJHAgACjmbJBZVz9vtWPHSXPQQ",
    "mood": "teasing",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😜"
  },
  "CAACAgIAAxUAAWqUbEE7Nb0JbRjjd1xrgIwdW6w0AAJJAgACjmbJBR7EwgYH7pSXPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEE7Nb0JbRjjd1xrgIwdW6w0AAJJAgACjmbJBR7EwgYH7pSXPQQ",
    "mood": "roasting",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😈"
  },
  "CAACAgIAAxUAAWqUbEFroT1UrygjorDRZG4bL_1HAAJPAgACjmbJBf6jrDGnEqoQPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEFroT1UrygjorDRZG4bL_1HAAJPAgACjmbJBf6jrDGnEqoQPQQ",
    "mood": "flirty",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😏"
  },
  "CAACAgIAAxUAAWqUbEE2O2k2yopaXx_bKTzeo_hyAAJTAgACjmbJBbfUG5GQEdR9PQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEE2O2k2yopaXx_bKTzeo_hyAAJTAgACjmbJBbfUG5GQEdR9PQQ",
    "mood": "grumpy",
    "packName": "EmojiPack",
    "packTitle": "emojis",
    "emoji": "😤"
  },
  "CAACAgUAAxUAAWqUbEBMrAH5vnk8fZTGL1EvjjDdAAIhAwACHnvgVlix5HiKcvXgPQQ": {
    "fileId": "CAACAgUAAxUAAWqUbEBMrAH5vnk8fZTGL1EvjjDdAAIhAwACHnvgVlix5HiKcvXgPQQ",
    "mood": "joyful",
    "packName": "Doge_pack",
    "packTitle": "DOGE PACK || BY @ITS_KING_HYPER",
    "emoji": "😁"
  },
  "CAACAgUAAxUAAWqUbECXSG0ZJnKqKOQrW2jrl2FCAAJ1AwACQJ7ZVrjLJK2Tsw31PQQ": {
    "fileId": "CAACAgUAAxUAAWqUbECXSG0ZJnKqKOQrW2jrl2FCAAJ1AwACQJ7ZVrjLJK2Tsw31PQQ",
    "mood": "cute",
    "packName": "Doge_pack",
    "packTitle": "DOGE PACK || BY @ITS_KING_HYPER",
    "emoji": "🥺"
  },
  "CAACAgUAAxUAAWqUbEB-OA5TqHvl70dczzHPv-TXAAKEAgACM_TgVqbdO5CGsc4DPQQ": {
    "fileId": "CAACAgUAAxUAAWqUbEB-OA5TqHvl70dczzHPv-TXAAKEAgACM_TgVqbdO5CGsc4DPQQ",
    "mood": "joyful",
    "packName": "Doge_pack",
    "packTitle": "DOGE PACK || BY @ITS_KING_HYPER",
    "emoji": "😁"
  },
  "CAACAgUAAxUAAWqUbEDCpuE_4MXPK8CxXhVBP7oLAALvBQACnsPhVrqqDoAcq3JlPQQ": {
    "fileId": "CAACAgUAAxUAAWqUbEDCpuE_4MXPK8CxXhVBP7oLAALvBQACnsPhVrqqDoAcq3JlPQQ",
    "mood": "joyful",
    "packName": "Doge_pack",
    "packTitle": "DOGE PACK || BY @ITS_KING_HYPER",
    "emoji": "😁"
  },
  "CAACAgUAAxUAAWqUbECI4AcjXchYb1o32ze6OHOuAAI2AwAC21LgVnOuuGNspjgNPQQ": {
    "fileId": "CAACAgUAAxUAAWqUbECI4AcjXchYb1o32ze6OHOuAAI2AwAC21LgVnOuuGNspjgNPQQ",
    "mood": "grumpy",
    "packName": "Doge_pack",
    "packTitle": "DOGE PACK || BY @ITS_KING_HYPER",
    "emoji": "😒"
  },
  "CAACAgUAAxUAAWqUbEDzFUF9fpNLqwQM_69xxd8EAAJPAwACeJTZVm8qW3CWhbgKPQQ": {
    "fileId": "CAACAgUAAxUAAWqUbEDzFUF9fpNLqwQM_69xxd8EAAJPAwACeJTZVm8qW3CWhbgKPQQ",
    "mood": "joyful",
    "packName": "Doge_pack",
    "packTitle": "DOGE PACK || BY @ITS_KING_HYPER",
    "emoji": "😁"
  },
  "CAACAgUAAxUAAWqUbEDXM1c_YRC-TEUJR_7mc0NqAALdAgAC1YngVsZocKU1ML8ZPQQ": {
    "fileId": "CAACAgUAAxUAAWqUbEDXM1c_YRC-TEUJR_7mc0NqAALdAgAC1YngVsZocKU1ML8ZPQQ",
    "mood": "joyful",
    "packName": "Doge_pack",
    "packTitle": "DOGE PACK || BY @ITS_KING_HYPER",
    "emoji": "😁"
  },
  "CAACAgUAAxUAAWqUbEDHg-JbT1KL3lK03Wgki-ZRAALtBAACteDZVgOInPELu3i8PQQ": {
    "fileId": "CAACAgUAAxUAAWqUbEDHg-JbT1KL3lK03Wgki-ZRAALtBAACteDZVgOInPELu3i8PQQ",
    "mood": "joyful",
    "packName": "Doge_pack",
    "packTitle": "DOGE PACK || BY @ITS_KING_HYPER",
    "emoji": "😁"
  },
  "CAACAgUAAxUAAWqUbEB2jynuouAgEuC4SJtPiD4gAAKlAwACWn7ZVsKDn4MnnwKhPQQ": {
    "fileId": "CAACAgUAAxUAAWqUbEB2jynuouAgEuC4SJtPiD4gAAKlAwACWn7ZVsKDn4MnnwKhPQQ",
    "mood": "cute",
    "packName": "Doge_pack",
    "packTitle": "DOGE PACK || BY @ITS_KING_HYPER",
    "emoji": "🥺"
  },
  "CAACAgUAAxUAAWqUbEC8B4EIIXjtS98gUaTYfNPyAAIxAgACjcDhVnpiy4cY1ZBMPQQ": {
    "fileId": "CAACAgUAAxUAAWqUbEC8B4EIIXjtS98gUaTYfNPyAAIxAgACjcDhVnpiy4cY1ZBMPQQ",
    "mood": "caring",
    "packName": "Doge_pack",
    "packTitle": "DOGE PACK || BY @ITS_KING_HYPER",
    "emoji": "🥺"
  },
  "CAACAgUAAxUAAWqUbED7dJNwRm8PrioME_t9pCVFAAK7AgACLmvZVu3NnWYz_KK-PQQ": {
    "fileId": "CAACAgUAAxUAAWqUbED7dJNwRm8PrioME_t9pCVFAAK7AgACLmvZVu3NnWYz_KK-PQQ",
    "mood": "caring",
    "packName": "Doge_pack",
    "packTitle": "DOGE PACK || BY @ITS_KING_HYPER",
    "emoji": "🥺"
  },
  "CAACAgUAAxUAAWqUbECCLiXBslAEWb1qbSfz0g1wAAJLAwACumzYVrGG9Kz23hFWPQQ": {
    "fileId": "CAACAgUAAxUAAWqUbECCLiXBslAEWb1qbSfz0g1wAAJLAwACumzYVrGG9Kz23hFWPQQ",
    "mood": "caring",
    "packName": "Doge_pack",
    "packTitle": "DOGE PACK || BY @ITS_KING_HYPER",
    "emoji": "🥺"
  },
  "CAACAgUAAxUAAWqUbEBeMqcX5llKvsZxx30bDBv_AAKPAgACP8LYVpdGhz5uCtRwPQQ": {
    "fileId": "CAACAgUAAxUAAWqUbEBeMqcX5llKvsZxx30bDBv_AAKPAgACP8LYVpdGhz5uCtRwPQQ",
    "mood": "romantic",
    "packName": "Doge_pack",
    "packTitle": "DOGE PACK || BY @ITS_KING_HYPER",
    "emoji": "❤️"
  },
  "CAACAgUAAxUAAWqUbEBJiwuo9oH4ZG4KwEisrhXGAALkAgACC7jhVkt6MQNjKgpKPQQ": {
    "fileId": "CAACAgUAAxUAAWqUbEBJiwuo9oH4ZG4KwEisrhXGAALkAgACC7jhVkt6MQNjKgpKPQQ",
    "mood": "roasting",
    "packName": "Doge_pack",
    "packTitle": "DOGE PACK || BY @ITS_KING_HYPER",
    "emoji": "🖕"
  },
  "CAACAgUAAxUAAWqUbEB2Ldp5m8wGdSfKulHbraYwAAKbAgACNPvhVjsHctKayucDPQQ": {
    "fileId": "CAACAgUAAxUAAWqUbEB2Ldp5m8wGdSfKulHbraYwAAKbAgACNPvhVjsHctKayucDPQQ",
    "mood": "romantic",
    "packName": "Doge_pack",
    "packTitle": "DOGE PACK || BY @ITS_KING_HYPER",
    "emoji": "❤️"
  },
  "CAACAgUAAxUAAWqUbEA-yuCUBgnlaBcD4dsP-9XZAALvAQACISjgVjBSqowJyJYkPQQ": {
    "fileId": "CAACAgUAAxUAAWqUbEA-yuCUBgnlaBcD4dsP-9XZAALvAQACISjgVjBSqowJyJYkPQQ",
    "mood": "grumpy",
    "packName": "Doge_pack",
    "packTitle": "DOGE PACK || BY @ITS_KING_HYPER",
    "emoji": "😒"
  },
  "CAACAgUAAxUAAWqUbEDCGVEvF2-68ZCa6QqipFJzAAIgBAACnL3hVgFJ9zFVC7vPPQQ": {
    "fileId": "CAACAgUAAxUAAWqUbEDCGVEvF2-68ZCa6QqipFJzAAIgBAACnL3hVgFJ9zFVC7vPPQQ",
    "mood": "romantic",
    "packName": "Doge_pack",
    "packTitle": "DOGE PACK || BY @ITS_KING_HYPER",
    "emoji": "❤️"
  },
  "CAACAgIAAxUAAWqUbENo4XVjDbza4EqIS1BXep0xAALDAAPUWkUBktqqvTFaEkY9BA": {
    "fileId": "CAACAgIAAxUAAWqUbENo4XVjDbza4EqIS1BXep0xAALDAAPUWkUBktqqvTFaEkY9BA",
    "mood": "flirty",
    "packName": "Mochi",
    "packTitle": "Mochi",
    "emoji": "😏"
  },
  "CAACAgIAAxUAAWqUbEPnWH123FMjWyqctbpluQSFAALJAAPUWkUBXe5c8uYYbK49BA": {
    "fileId": "CAACAgIAAxUAAWqUbEPnWH123FMjWyqctbpluQSFAALJAAPUWkUBXe5c8uYYbK49BA",
    "mood": "flirty",
    "packName": "Mochi",
    "packTitle": "Mochi",
    "emoji": "😉"
  },
  "CAACAgIAAxUAAWqUbENGi1gmimk8udioKtMvE2ulAAKIAgAC1FpFAU3nZUNIJe4mPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbENGi1gmimk8udioKtMvE2ulAAKIAgAC1FpFAU3nZUNIJe4mPQQ",
    "mood": "peaceful",
    "packName": "Mochi",
    "packTitle": "Mochi",
    "emoji": "💤"
  },
  "CAACAgIAAxUAAWqUbEZchLKiVPfYShRjlYiDrG5mAAIoAgACygMGC8X2oz3sZe85PQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEZchLKiVPfYShRjlYiDrG5mAAIoAgACygMGC8X2oz3sZe85PQQ",
    "mood": "romantic",
    "packName": "TeddyBear",
    "packTitle": "Scarf Ace",
    "emoji": "😘"
  },
  "CAACAgIAAxUAAWqUbEZU-z3Vat4bC4FduzTjppzpAAIjAgACygMGC0_vgJoksGJsPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEZU-z3Vat4bC4FduzTjppzpAAIjAgACygMGC0_vgJoksGJsPQQ",
    "mood": "romantic",
    "packName": "TeddyBear",
    "packTitle": "Scarf Ace",
    "emoji": "❤️"
  },
  "CAACAgIAAxUAAWqUbEYAAefLH8xtC4fsuvSUviKzYgACKgIAAsoDBgvFcFUZfX3bLz0E": {
    "fileId": "CAACAgIAAxUAAWqUbEYAAefLH8xtC4fsuvSUviKzYgACKgIAAsoDBgvFcFUZfX3bLz0E",
    "mood": "peaceful",
    "packName": "TeddyBear",
    "packTitle": "Scarf Ace",
    "emoji": "😌"
  },
  "CAACAgIAAxUAAWqUbEZVsMn-4CtqyUGDYRbGlg2cAAItAgACygMGC9HrUeneGx_ZPQQ": {
    "fileId": "CAACAgIAAxUAAWqUbEZVsMn-4CtqyUGDYRbGlg2cAAItAgACygMGC9HrUeneGx_ZPQQ",
    "mood": "peaceful",
    "packName": "TeddyBear",
    "packTitle": "Scarf Ace",
    "emoji": "☕️"
  },
  "CAACAgEAAxUAAWqUbEWPX_z5VHcB58t_T0YxwhakAAJRAAOd9jsMuQrlDOCuUpo9BA": {
    "fileId": "CAACAgEAAxUAAWqUbEWPX_z5VHcB58t_T0YxwhakAAJRAAOd9jsMuQrlDOCuUpo9BA",
    "mood": "peaceful",
    "packName": "CatMoods",
    "packTitle": "Cats",
    "emoji": "☕"
  }
};

// Compatible fallback chains when a primary mood is depleted or has no custom matches
export const MOOD_FALLBACK_MATRIX: Record<string, string[]> = {
  normal: ['friendly', 'peaceful', 'happy'],
  friendly: ['happy', 'cute', 'peaceful', 'normal'],
  cute: ['friendly', 'playful', 'happy', 'loving', 'normal'],
  happy: ['joyful', 'playful', 'friendly', 'cute', 'normal'],
  playful: ['funny', 'teasing', 'happy', 'joyful', 'normal'],
  funny: ['playful', 'teasing', 'sarcastic', 'happy', 'normal'],
  teasing: ['playful', 'sarcastic', 'roasting', 'funny', 'normal'],
  roasting: ['teasing', 'sarcastic', 'grumpy', 'normal'],
  sarcastic: ['teasing', 'roasting', 'grumpy', 'normal'],
  caring: ['friendly', 'loving', 'peaceful', 'cute', 'normal'],
  loving: ['caring', 'romantic', 'cute', 'friendly', 'normal'],
  romantic: ['loving', 'flirty', 'caring', 'cute', 'friendly', 'normal'],
  flirty: ['romantic', 'playful', 'teasing', 'cute', 'friendly', 'normal'],
  angry: ['grumpy', 'sarcastic', 'anxious', 'normal'],
  sad: ['gloomy', 'anxious', 'caring', 'normal'],
  gloomy: ['sad', 'anxious', 'grumpy', 'normal'],
  anxious: ['confused', 'sad', 'surprised', 'normal'],
  peaceful: ['friendly', 'caring', 'happy', 'normal'],
  surprised: ['confused', 'playful', 'anxious', 'normal'],
  confused: ['surprised', 'sarcastic', 'anxious', 'normal'],
  grumpy: ['angry', 'sarcastic', 'gloomy', 'normal'],
  joyful: ['happy', 'playful', 'excited', 'friendly', 'normal']
};

export function getDefaultStickersForMood(mood: string): string[] {
  const norm = mood.toLowerCase().trim();
  if (DEFAULT_STICKERS_BY_MOOD[norm] && DEFAULT_STICKERS_BY_MOOD[norm].length > 0) {
    return [...DEFAULT_STICKERS_BY_MOOD[norm]];
  }
  // Try fallback matrix
  const fallbacks = MOOD_FALLBACK_MATRIX[norm] || ['normal'];
  for (const fb of fallbacks) {
    if (DEFAULT_STICKERS_BY_MOOD[fb] && DEFAULT_STICKERS_BY_MOOD[fb].length > 0) {
      return [...DEFAULT_STICKERS_BY_MOOD[fb]];
    }
  }
  return [...(DEFAULT_STICKERS_BY_MOOD['normal'] || [])];
}

export function getDefaultStickersStats(): {
  totalStickers: number;
  totalMoods: number;
  moodCounts: Record<string, number>;
  totalPacks: number;
  packNames: string[];
} {
  const moodCounts: Record<string, number> = {};
  let totalStickers = 0;
  for (const [m, list] of Object.entries(DEFAULT_STICKERS_BY_MOOD)) {
    moodCounts[m] = list.length;
    totalStickers += list.length;
  }
  const packs = new Set(Object.values(DEFAULT_STICKER_METADATA).map(meta => meta.packName));
  return {
    totalStickers,
    totalMoods: Object.keys(DEFAULT_STICKERS_BY_MOOD).length,
    moodCounts,
    totalPacks: packs.size,
    packNames: Array.from(packs)
  };
}
