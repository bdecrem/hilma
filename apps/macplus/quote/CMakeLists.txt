cmake_minimum_required(VERSION 3.5)
project(Quote C)

# Quote of the Day app — links the WiFi system service (../wifi/wifi.c).
add_application(Quote quote.c ${CMAKE_CURRENT_SOURCE_DIR}/../wifi/wifi.c)
target_include_directories(Quote PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../wifi)
set_target_properties(Quote PROPERTIES COMPILE_OPTIONS -ffunction-sections)

if(CMAKE_SYSTEM_NAME MATCHES Retro68)
    set_target_properties(Quote PROPERTIES LINK_FLAGS "-Wl,-gc-sections -Wl,--mac-strip-macsbug")
else()
    set_target_properties(Quote PROPERTIES LINK_FLAGS "-Wl,-gc-sections")
endif()
