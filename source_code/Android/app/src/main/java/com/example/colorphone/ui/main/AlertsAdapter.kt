package com.example.colorphone.ui.main

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import com.example.colorphone.R
import com.example.colorphone.data.remote.dto.AlertItem
import com.example.colorphone.databinding.AlertItemLayoutBinding // Cần cài đặt View Binding

class AlertsAdapter(private val alerts: List<AlertItem>) :
    RecyclerView.Adapter<AlertsAdapter.AlertViewHolder>() {

    // Khai báo một interface để xử lý sự kiện click
    var onItemClick: ((AlertItem) -> Unit)? = null

    // View Binding là cách hiện đại, nên tôi đề xuất bạn dùng nó.
    inner class AlertViewHolder(private val binding: AlertItemLayoutBinding) :
        RecyclerView.ViewHolder(binding.root) {

        fun bind(alert: AlertItem) {
            // Thiết lập màu sắc và icon theo mức độ nghiêm trọng
            val severityColor = when (alert.severity.uppercase()) {
                "HIGH", "CRITICAL" -> R.color.red
                "MEDIUM" -> R.color.orange
                else -> R.color.dark_gray
            }
            val iconRes = when (alert.severity.uppercase()) {
                "HIGH", "CRITICAL" -> R.drawable.ic_flood_marker // Giả sử có icon error
                "MEDIUM" -> R.drawable.ic_warning // Giả sử có icon warning
                else -> R.drawable.outline_chat_info_24 // Giả sử có icon info
            }

            binding.ivSeverityIcon.setImageResource(iconRes)
            binding.ivSeverityIcon.setColorFilter(ContextCompat.getColor(itemView.context, severityColor))

            // Hiển thị dữ liệu
            binding.tvTitle.text = "${alert.type} - ${alert.deviceName ?: "Unknown Device"}"
            binding.tvMessage.text = alert.message
            binding.tvTimestamp.text = alert.createdAt // Cần format lại String này trong thực tế

            // Xử lý sự kiện click
            binding.root.setOnClickListener {
                onItemClick?.invoke(alert)
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): AlertViewHolder {
        val binding = AlertItemLayoutBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return AlertViewHolder(binding)
    }

    override fun onBindViewHolder(holder: AlertViewHolder, position: Int) {
        holder.bind(alerts[position])
    }

    override fun getItemCount(): Int = alerts.size
}