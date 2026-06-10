cmake_minimum_required(VERSION 3.5)
project(Bridge C)

# The Bridge — links the WiFi system service (../wifi/wifi.c) and includes the
# shared frame parser from ../foundry.
add_application(Bridge bridge.c ${CMAKE_CURRENT_SOURCE_DIR}/../wifi/wifi.c)
target_include_directories(Bridge PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/../wifi
    ${CMAKE_CURRENT_SOURCE_DIR}/../foundry)
set_target_properties(Bridge PROPERTIES COMPILE_OPTIONS -ffunction-sections)

if(CMAKE_SYSTEM_NAME MATCHES Retro68)
    set_target_properties(Bridge PROPERTIES LINK_FLAGS "-Wl,-gc-sections -Wl,--mac-strip-macsbug")
else()
    set_target_properties(Bridge PROPERTIES LINK_FLAGS "-Wl,-gc-sections")
endif()
