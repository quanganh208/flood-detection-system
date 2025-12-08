package com.example.colorphone.ui.main

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.DialogFragment
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.colorphone.R
import com.example.colorphone.data.remote.dto.AlertItem
import com.example.colorphone.databinding.DialogAlertsBinding
import com.google.android.material.snackbar.Snackbar

class AlertsFragment : DialogFragment() {

    private var _binding: DialogAlertsBinding? = null
    private val binding get() = _binding!!

    // Danh sách data được truyền vào
    private val alertsList: List<AlertItem> by lazy {
        arguments?.getParcelableArrayList(KEY_ALERTS) ?: emptyList()
    }

    // 1. Thiết lập Style cho Dialog (Full Screen)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setStyle(STYLE_NORMAL, R.style.FullScreenDialogTheme)
        // Lưu ý: Bạn cần định nghĩa R.style.FullScreenDialogTheme trong styles.xml
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = DialogAlertsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // Thiết lập Toolbar
        binding.toolbarAlerts.setNavigationIcon(R.drawable.outline_close_24) // Giả sử có icon đóng
        binding.toolbarAlerts.setNavigationOnClickListener {
            dismiss() // Đóng dialog
        }
        binding.toolbarAlerts.title = "Thông báo Cảnh báo (${alertsList.size})"

        // Thiết lập RecyclerView
        val adapter = AlertsAdapter(alertsList)
        binding.rvAlerts.adapter = adapter
        binding.rvAlerts.layoutManager = LinearLayoutManager(context)

        // Xử lý sự kiện click trên từng item
        adapter.onItemClick = { alertItem ->
            Snackbar.make(binding.root, "Clicked: ${alertItem.message}", Snackbar.LENGTH_SHORT).show()
            // Tại đây, bạn có thể gọi một màn hình chi tiết (Detail Screen)
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    companion object {
        const val TAG = "AlertsFragment"
        private const val KEY_ALERTS = "alerts_list"

        // Hàm tạo Dialog Fragment kèm data
        fun newInstance(alerts: List<AlertItem>): AlertsFragment {
            val fragment = AlertsFragment()
            val args = Bundle()
            args.putParcelableArrayList(KEY_ALERTS, ArrayList(alerts)) // AlertItem cần implement Parcelable
            fragment.arguments = args
            return fragment
        }
    }
}