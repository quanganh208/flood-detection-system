package com.example.colorphone.ui.main

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.DrawableRes
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.content.res.AppCompatResources
import androidx.core.content.ContextCompat
import com.example.colorphone.databinding.ActivityMainBinding
import com.example.colorphone.ui.share.base.BaseActivity
import com.mapbox.bindgen.Value
import com.mapbox.geojson.Point
import com.mapbox.maps.CameraOptions
import com.mapbox.maps.MapView
import com.mapbox.maps.Style
import com.mapbox.maps.plugin.annotation.annotations
import androidx.core.graphics.createBitmap
import androidx.core.graphics.drawable.toBitmap
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.example.colorphone.R
import com.example.colorphone.data.remote.dto.AlertItem
import com.example.colorphone.domain.models.DeviceModel
import com.example.colorphone.domain.models.WaterStatus
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.firebase.messaging.FirebaseMessaging
import com.google.gson.JsonElement
import com.mapbox.geojson.LineString
import com.mapbox.maps.extension.style.layers.properties.generated.LineJoin
import com.mapbox.maps.plugin.animation.flyTo
import com.mapbox.maps.plugin.annotation.generated.PointAnnotationManager
import com.mapbox.maps.plugin.annotation.generated.PointAnnotationOptions
import com.mapbox.maps.plugin.annotation.generated.PolylineAnnotationManager
import com.mapbox.maps.plugin.annotation.generated.PolylineAnnotationOptions
import com.mapbox.maps.plugin.annotation.generated.createPointAnnotationManager
import com.mapbox.maps.plugin.annotation.generated.createPolylineAnnotationManager
import kotlinx.coroutines.launch

class MainActivity : BaseActivity<ActivityMainBinding>(ActivityMainBinding::inflate) {
    private lateinit var mapView: MapView

    private lateinit var binding: ActivityMainBinding

    private val vm = MainViewmodel()

    companion object {
        private const val MARKER_WIDTH_PIXELS = 72
        private const val MARKER_HEIGHT_PIXELS = 72
    }



    private var isSetLocation = false

    private lateinit var fusedLocationClient: FusedLocationProviderClient

//    private lateinit var annotationManager: PointAnnotationManager

    private lateinit var cameraOptions: CameraOptions
    private lateinit var requestPermissionLauncher: ActivityResultLauncher<Array<String>>


    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        binding = ActivityMainBinding.inflate(layoutInflater)

        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)

        setupMapBox()

        setupPermission()

        requestNotificationPermission()

        checkLocationPermission()

        getFCMToken()

        setContentView(binding.root)

        binding.btnNotification.setOnClickListener {
            showAlertsDialog()
        }
    }

    private fun setupMapBox() {
        mapView = binding.mapView

        cameraOptions =  CameraOptions.Builder()
            .center(Point.fromLngLat(105.787406, 20.980913))
            .pitch(60.0)
            .zoom(16.5)
            .bearing(-15.0)
            .build()

        mapView.mapboxMap.apply {
            loadStyle(Style.STANDARD) { style ->

                style.setStyleImportConfigProperty("basemap", "lightPreset", Value("dusk"))

                style.setStyleImportConfigProperty("basemap", "show3dObjects", Value(true))

                style.setStyleImportConfigProperty("basemap", "showPointOfInterestLabels", Value(false))

                style.setStyleImportConfigProperty("basemap", "showTransitLabels", Value(false))

//                setupAnnotationManager(mapView)
            }

//            drawFloodedRoad()

//            addFloodMarker()

            observeState()
        }
    }

    // --- HÀM 2: Vẽ đoạn đường ngập (Polyline) ---
    private fun drawFloodedRoad() {
        val annotationApi = mapView.annotations
        val polylineManager = annotationApi.createPolylineAnnotationManager()

        val roadCoordinates = listOf(
            // Điểm 1: Hướng về phía Hà Nội (Gần ngõ Ao Sen)
            Point.fromLngLat(105.790807, 20.982756),

            // Điểm 2: Ngay trước cổng Học viện (PTIT)
            Point.fromLngLat(105.787889, 20.980312),

            // Điểm 3: Hướng về phía Hà Đông (Gần Coopmart)
            Point.fromLngLat(105.786322, 20.979040)
        )

        // --- VẼ CHỒNG LỚP (STACKING) VỚI ĐẦU CẮT BẰNG ---

//        // 1. Lớp ĐÁY (Màu Xanh) - Rộng nhất
//        createPolyline(polylineManager, roadCoordinates, "#0000FF", 60.0, 0.3)
//
//        // 2. Lớp GIỮA (Màu Tím)
//        createPolyline(polylineManager, roadCoordinates, "#800080", 35.0, 0.5)

        // 3. Lớp ĐỈNH (Màu Đỏ) - Tâm lụt
        createPolyline(polylineManager, roadCoordinates, "#FF0000", 12.0, 0.9)
    }

    // --- CẬP NHẬT HÀM HELPER ---
    private fun createPolyline(
        manager: PolylineAnnotationManager,
        points: List<Point>,
        colorHex: String,
        width: Double,
        opacity: Double
    ) {
        val options = PolylineAnnotationOptions()
            .withGeometry(LineString.fromLngLats(points))
            .withLineColor(colorHex)
            .withLineWidth(width)
            .withLineOpacity(opacity)
            .withLineJoin(LineJoin.ROUND)

        manager.create(options)
    }

    private fun setupAnnotationManager(mapView: MapView) {
//        val annotationPlugin = mapView.annotations
//        annotationManager = annotationPlugin.createPointAnnotationManager()

        // Optionally set a click listener on the markers here
        // annotationManager.addClickListener { pointAnnotation -> ... }
    }

    private fun addFloodMarker() {
        val annotationApi = mapView.annotations
        val pointAnnotationManager = annotationApi.createPointAnnotationManager()

        val bitmap = bitmapFromDrawableRes(R.drawable.ic_flood_marker) ?: return

        val floodPoints = listOf(
            Point.fromLngLat(105.787545, 20.980102), // Ngõ tắt bên cạnh trường
            Point.fromLngLat(105.7865, 20.9805), // Đường Nguyễn Trãi đoạn thấp
            Point.fromLngLat(105.7890, 20.9795)  // Khu vực hồ Văn Quán gần đó
        )

        val pointAnnotations = floodPoints.map { point ->
            PointAnnotationOptions()
                .withPoint(point)           // Vị trí
                .withIconImage(bitmap)      // Hình ảnh
                .withIconSize(1.5)          // Kích thước (1.0 là gốc, 1.5 là to hơn chút)
                .withTextField("Ngập sâu!") // (Tùy chọn) Chữ hiện dưới icon
                .withTextOffset(listOf(0.0, 2.0)) // Đẩy chữ xuống dưới icon
                .withTextColor("red")       // Màu chữ
        }

        pointAnnotationManager.create(pointAnnotations)

    }

    private fun bitmapFromDrawableRes(@DrawableRes resourceId: Int): Bitmap? {
        val sourceDrawable = AppCompatResources.getDrawable(this, resourceId) ?: return null
        if (sourceDrawable is BitmapDrawable) {
            return sourceDrawable.bitmap
        }

        // Nếu là Vector thì phải vẽ ra Canvas
        val constantState = sourceDrawable.constantState ?: return null
        val drawable = constantState.newDrawable().mutate()

        val bitmap = createBitmap(drawable.intrinsicWidth, drawable.intrinsicHeight)
        val canvas = Canvas(bitmap)
        drawable.setBounds(0, 0, canvas.width, canvas.height)
        drawable.draw(canvas)
        return bitmap
    }

    private fun setupPermission() {
        requestPermissionLauncher = registerForActivityResult(
            ActivityResultContracts.RequestMultiplePermissions()
        ) { permissions ->
            val fineLocationGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION]
            val coarseLocationGranted = permissions[Manifest.permission.ACCESS_COARSE_LOCATION]

            if(fineLocationGranted == true || coarseLocationGranted == true) {
                getLocation()
            } else {
                Toast.makeText(this, "Cần cho quyền", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun checkLocationPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            getLocation()
        } else {
            requestPermissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                )
            )
        }
    }

    private fun getLocation() {
        if (
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED && ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        fusedLocationClient.lastLocation.addOnSuccessListener { location ->
//            if(location == null) {
//                return@addOnSuccessListener
//            }

            var latitude = location?.latitude
            var longitude = location?.longitude

            Log.d("TAGG", "getLocation: latitude=$latitude longitude=$longitude")

            //TODO: Remove
            latitude = 20.980913
            longitude = 105.787406

            addUserLocation(longitude, latitude)

            if(!isSetLocation) {
                isSetLocation = true

                cameraOptions =  CameraOptions.Builder()
                    .center(Point.fromLngLat(longitude, latitude))
                    .pitch(60.0)
                    .zoom(16.5)
                    .bearing(-15.0)
                    .build()

                mapView.mapboxMap.setCamera(cameraOptions)
            }
        }
    }

    private fun addUserLocation(longitude: Double, latitude: Double) {
        val annotationApi = mapView.annotations
        val pointAnnotationManager = annotationApi.createPointAnnotationManager()

        val myBitmap = bitmapFromDrawableRes(R.drawable.ic_my_location) ?: return

        val myLocation = Point.fromLngLat(longitude, latitude)

        val pointAnnotationOptions = PointAnnotationOptions()
            .withPoint(myLocation)
            .withIconImage(myBitmap)
            .withIconSize(1.2)
            .withTextField("Here")
            .withTextOffset(listOf(0.0, 2.0))
            .withTextColor("blue")

        pointAnnotationManager.create(pointAnnotationOptions)
    }

    private fun bitmapFromResource(id: Int): Bitmap {
        val drawable = ContextCompat.getDrawable(this, id)
            ?: throw IllegalArgumentException("Drawable resource not found for ID: $id")

        val originalBitmap = drawable.toBitmap()

        val scaledBitmap = Bitmap.createScaledBitmap(
            originalBitmap,
            MARKER_WIDTH_PIXELS, // 24
            MARKER_HEIGHT_PIXELS, // 24
            false // Setting this to false can slightly speed up the process if you don't need filtering
        )

        // Note: The originalBitmap can be garbage collected after scaling.
        return scaledBitmap
    }

    private fun observeState() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch {
                    vm.devicesState.collect { devices ->
                        Log.d("TAGG", "observeState: $devices")
                        addDeviceMarkersToMap(devices)
                    }
                }
                launch {
                    vm.notificationsState.collect { notifications ->
                        Log.d("TAGG", "observeState: $notifications")
                        binding.notiText.text = notifications.size.toString()
                    }
                }
            }
        }
    }

    fun addDeviceMarkersToMap(deviceModels: List<DeviceModel>) {
        val annotationManager: PointAnnotationManager = mapView.annotations.createPointAnnotationManager()

        annotationManager.addClickListener { pointAnnotation ->
            showDeviceDetailsDialog(pointAnnotation.getData())
            true
        }

        // Create a mutable list to hold all the options
        val annotationOptionsList = mutableListOf<PointAnnotationOptions>()

        deviceModels.forEach { device ->
            // Ensure the device has valid coordinates before adding a marker
            val coordinates = device.coordinate
            if (coordinates != null) {
                // CRITICAL: Mapbox uses Point.fromLngLat(Longitude, Latitude)
                val point = Point.fromLngLat(coordinates.second, coordinates.first)

                // Determine the marker color/icon based on the status for visual feedback
                val icon = getStatusIcon(device.waterStatus)

                val options = PointAnnotationOptions()
                    .withPoint(point)
                    .withIconImage(icon)
                    // Optional: Add metadata that can be retrieved on a click event
                    .withData(
                        com.google.gson.JsonPrimitive(device.id)
                    )
                    // Optional: Show the device name as the title/callout
                    .withTextField(device.name)
                    .withTextOffset(listOf(0.0, -2.0)) // Offset text above the marker

                annotationOptionsList.add(options)
            }
        }

        // 3. Add all markers to the map at once
        annotationManager.create(annotationOptionsList)
    }

    private fun getStatusIcon(status: WaterStatus): Bitmap {
        return when (status) {
            WaterStatus.CRITICAL, WaterStatus.DANGER ->
                bitmapFromResource(R.drawable.ic_flood_marker)
            WaterStatus.SAFE, WaterStatus.LOW ->
                bitmapFromResource(R.drawable.ic_safe)
            else -> bitmapFromResource(R.drawable.ic_warning)
        }
    }

    private fun showDeviceDetailsDialog(jsonData: JsonElement?) {
        val deviceId = jsonData?.asString ?: return // Exit if ID is null or missing

        val device = vm.devicesState.value.find { it.id == deviceId }

        if (device == null) {
            // Handle case where data is stale or ID is bad
            // Toast.makeText(this, "Device details not found.", Toast.LENGTH_SHORT).show()
            return
        }

        // 3. Construct the detail message string
        val message = """
        Online Status: ${if (device.isOnline) "🟢 Online" else "🔴 Offline"}
        Water Status: ${device.waterStatus}
        Rain Status: ${device.rainStatus}
        Water Level: ${device.waterLevel ?: "N/A"}
        Last Update: ${device.lastUpdateDisplay}
        Alert Count: ${device.alertCount}
        Coordinates: (${device.coordinate?.first?.format(4)}, ${device.coordinate?.second?.format(4)})
    """.trimIndent()

        // 4. Build and show the AlertDialog
        AlertDialog.Builder(this)
            .setTitle("Details: ${device.name}")
            .setMessage(message)
            .setPositiveButton("Close") { dialog, _ ->
                dialog.dismiss()
            }
            .show()
    }

    // Helper extension to format Doubles for display (optional)
    private fun Double.format(decimals: Int): String = "%.${decimals}f".format(this)

    private fun showAlertsDialog() {
        // --- CHUẨN BỊ DỮ LIỆU MOCK (Dữ liệu thử nghiệm) ---
        // Trong ứng dụng thực tế, bạn sẽ lấy dữ liệu này từ ViewModel/Repository.
        val dummyAlerts = vm.notificationsState.value
        // --- KẾT THÚC DỮ LIỆU MOCK ---

        // Hiển thị Dialog Fragment
        AlertsFragment.newInstance(dummyAlerts).show(
            supportFragmentManager,
            AlertsFragment.TAG
        )
    }

    fun requestNotificationPermission() {
        // Chỉ cần xin quyền cho Android 13 (API 33) trở lên.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) { // TIRAMISU = API 33

            // 2. Kiểm tra trạng thái hiện tại của quyền
            when {
                // Quyền đã được cấp (trường hợp phổ biến nhất sau khi user chấp nhận)
                ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED -> {
                    // Quyền đã có, không cần làm gì thêm.
//                    showToast("Quyền thông báo đã được cấp trước đó.")
                }

                // Nên giải thích cho người dùng (trường hợp người dùng đã từ chối lần trước)
//                shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS) -> {
//                    // 3. Hiển thị dialog giải thích lý do cần quyền (Tên hàm chỉ là ví dụ)
//                    showPermissionRationaleDialog()
//                }

                // Yêu cầu xin quyền lần đầu hoặc khi không cần giải thích
                else -> {
                    // 4. Kích hoạt lời nhắc xin quyền của hệ thống
                    requestPermissionLauncher.launch(arrayOf(Manifest.permission.POST_NOTIFICATIONS))
                }
            }
        } else {
            // Với các phiên bản Android cũ hơn (dưới 13), quyền đã được cấp khi cài đặt app.
//            showToast("Quyền thông báo tự động được cấp.")
        }
    }

    fun getFCMToken() {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (!task.isSuccessful) {
                Log.w("TAGG", "Fetching FCM registration token failed", task.exception)
                return@addOnCompleteListener
            }

            // Token đã được lấy thành công
            val token = task.result
            Log.d("TAGG", "FCM Token: $token")

            vm.updateFcm(token)

            // PROPOSE: Gọi hàm gửi token lên server tại đây
            // sendRegistrationToServer(token)
        }
    }
}