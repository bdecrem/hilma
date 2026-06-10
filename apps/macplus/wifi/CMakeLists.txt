cmake_minimum_required(VERSION 3.5)
project(WiFiApps C)

add_application(MuxDemo muxdemo.c)
set_target_properties(MuxDemo PROPERTIES COMPILE_OPTIONS -ffunction-sections)

add_application(HelloWiFi hellowifi.c)
set_target_properties(HelloWiFi PROPERTIES COMPILE_OPTIONS -ffunction-sections)

# WiFi system service (wifi.c) + a test app that uses it through the API.
add_application(WiFiTest wifitest.c wifi.c)
set_target_properties(WiFiTest PROPERTIES COMPILE_OPTIONS -ffunction-sections)

if(CMAKE_SYSTEM_NAME MATCHES Retro68)
    set_target_properties(MuxDemo PROPERTIES LINK_FLAGS "-Wl,-gc-sections -Wl,--mac-strip-macsbug")
    set_target_properties(HelloWiFi PROPERTIES LINK_FLAGS "-Wl,-gc-sections -Wl,--mac-strip-macsbug")
    set_target_properties(WiFiTest PROPERTIES LINK_FLAGS "-Wl,-gc-sections -Wl,--mac-strip-macsbug")
else()
    set_target_properties(MuxDemo PROPERTIES LINK_FLAGS "-Wl,-gc-sections")
    set_target_properties(HelloWiFi PROPERTIES LINK_FLAGS "-Wl,-gc-sections")
    set_target_properties(WiFiTest PROPERTIES LINK_FLAGS "-Wl,-gc-sections")
endif()

# WiFi boot INIT — a flat code resource wrapped as an 'INIT' (the Retro68
# SystemExtension pattern). Brings the shared link up at startup.
add_executable(WiFiInit wifiinit.c)
set_target_properties(WiFiInit PROPERTIES
    OUTPUT_NAME WiFiInit.flt
    LINK_FLAGS -Wl,--mac-flat)
if (REZ_INCLUDE_PATH)
    set(REZ_INCLUDE_FLAG -I${REZ_INCLUDE_PATH})
endif()
add_custom_command(
    OUTPUT WiFiInit.bin WiFiInit.dsk
    COMMAND ${REZ} ${REZ_INCLUDE_FLAG}
                    ${CMAKE_CURRENT_SOURCE_DIR}/wifiinit.r
                    -o WiFiInit.bin
                    --cc WiFiInit.dsk
                    --cc WiFiInit
                    -t INIT
    DEPENDS WiFiInit wifiinit.r)
add_custom_target(WiFiInit_INIT ALL DEPENDS WiFiInit.dsk)
