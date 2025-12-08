package com.example.colorphone.data.remote.dto

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class Stats(
    val total: Int,
    val online: Int,
    val offline: Int,
    val safe: Int,
    val warning: Int,
    val danger: Int
)