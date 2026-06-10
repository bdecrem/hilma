cmake_minimum_required(VERSION 3.5)
project(WiFiApps C)

add_application(MuxDemo muxdemo.c)
set_target_properties(MuxDemo PROPERTIES COMPILE_OPTIONS -ffunction-sections)

add_application(HelloWiFi hellowifi.c)
set_target_properties(HelloWiFi PROPERTIES COMPILE_OPTIONS -ffunction-sections)

if(CMAKE_SYSTEM_NAME MATCHES Retro68)
    set_target_properties(MuxDemo PROPERTIES LINK_FLAGS "-Wl,-gc-sections -Wl,--mac-strip-macsbug")
    set_target_properties(HelloWiFi PROPERTIES LINK_FLAGS "-Wl,-gc-sections -Wl,--mac-strip-macsbug")
else()
    set_target_properties(MuxDemo PROPERTIES LINK_FLAGS "-Wl,-gc-sections")
    set_target_properties(HelloWiFi PROPERTIES LINK_FLAGS "-Wl,-gc-sections")
endif()
