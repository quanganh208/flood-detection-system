package com.example.colorphone.ui.main

import android.os.Bundle
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.fragment.app.DialogFragment
import com.example.colorphone.R
import com.example.colorphone.databinding.DialogDeviceDetailsBinding
import com.example.colorphone.data.remote.dto.Device // Giả sử Device là model của bạn
import com.example.colorphone.domain.models.DeviceModel
import com.example.colorphone.domain.models.WaterStatus

// Định nghĩa một interface/callback nếu cần gửi hành động trở lại Activity
// interface DeviceDetailsListener { fun onDismissed() }

class DeviceDetailsDialogFragment : DialogFragment() {

    private var _binding: DialogDeviceDetailsBinding? = null
    private val binding get() = _binding!!

    // Thiết bị được truyền vào
    private val device: DeviceModel? by lazy {
        arguments?.getParcelable(KEY_DEVICE)
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        // Tùy chỉnh: loại bỏ tiêu đề và nền mặc định của dialog
        dialog?.window?.setBackgroundDrawableResource(android.R.color.transparent)
        dialog?.window?.requestFeature(STYLE_NO_TITLE)

        _binding = DialogDeviceDetailsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // 💡 Bước 3: Đưa dữ liệu vào UI
        device?.let { bindDeviceData(it) } ?: dismiss() // Nếu device null, đóng dialog

        // Xử lý nút Đóng
        binding.btnClose.setOnClickListener {
            dismiss()
        }
    }

    private fun bindDeviceData(device: DeviceModel) {
        // Tiêu đề
        binding.tvTitle.text = "Details: ${device.name}"

        // --- 1. Trạng thái Online ---
        val isOnline = device.isOnline ?: false
        val onlineStatusColor = if (isOnline) R.color.green else R.color.red
        val statusText = if (isOnline) "🟢 ONLINE" else "🔴 OFFLINE"

        binding.tvOnlineStatus.text = statusText
        // Không set màu cho toàn bộ text, chỉ dùng emoji để nổi bật

        // --- 2. Tình trạng Nước (Water Status) ---
        val waterStatusString = device.waterStatus.toString().uppercase()

        // Xác định màu sắc động cho Water Status (FIX 2)
        val statusColorRes = when (device.waterStatus) {
            WaterStatus.CRITICAL, WaterStatus.DANGER -> R.color.red // Giả sử bạn có color.xml
            WaterStatus.LOW -> R.color.orange
            WaterStatus.SAFE -> R.color.green
            else -> R.color.dark_gray
        }

        binding.tvWaterStatus.text = waterStatusString
        // Áp dụng màu sắc động
        binding.tvWaterStatus.setTextColor(ContextCompat.getColor(requireContext(), statusColorRes))

        // --- 3. Mực nước ---
        val waterLevelText = device.waterLevel?.toString() ?: "N/A"
        binding.tvWaterLevel.text = waterLevelText + if (device.waterLevel != null) " m" else ""

        // --- 4. Cập nhật cuối (Thêm trường mới) ---
        // Giả sử device.lastUpdateDisplay là String đã được format (ví dụ: "2 phút trước")
        binding.tvLastUpdate.text = device.lastUpdateDisplay ?: "N/A"
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    companion object {
        const val TAG = "DeviceDetailsDialog"
        private const val KEY_DEVICE = "device_data"

        // Hàm tạo Dialog Fragment kèm dữ liệu (Device Model phải implement Parcelable)
        fun newInstance(device: DeviceModel): DeviceDetailsDialogFragment {
            val fragment = DeviceDetailsDialogFragment()
            val args = Bundle()
            args.putParcelable(KEY_DEVICE, device)
            fragment.arguments = args

            Log.d(TAG, "newInstance: $device")
            
            return fragment
        }
    }
}