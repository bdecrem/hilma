cmake_minimum_required(VERSION 3.5)
project(Porthole C)

# Porthole — remote-framebuffer web browser for the Mac Plus. Displays 1-bit
# frames streamed from the agent-porthole headless browser (port 2336), over the
# shared nettcp (../net) transport, decompressed with the zlibss codec (../pssh).
add_application(Porthole
    porthole.c
    porthole.r
    ${CMAKE_CURRENT_SOURCE_DIR}/../net/nettcp.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../pssh/zlibss.c
)

target_include_directories(Porthole PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/../net
    ${CMAKE_CURRENT_SOURCE_DIR}/../pssh)
set_target_properties(Porthole PROPERTIES COMPILE_OPTIONS -ffunction-sections)
if(CMAKE_SYSTEM_NAME MATCHES Retro68)
    set_target_properties(Porthole PROPERTIES LINK_FLAGS "-Wl,-gc-sections -Wl,--mac-strip-macsbug")
else()
    set_target_properties(Porthole PROPERTIES LINK_FLAGS "-Wl,-gc-sections")
endif()
